# Fleet ERP — Foundation (v1)

The cross-cutting foundation everything else builds on: **multi-tenancy**, a
**custom user + roles**, **company profile**, the **no-delete** rule, and the
**immutable audit log**. Stack: Django 5 + PostgreSQL + DRF.

## What's implemented

| File | Purpose |
|------|---------|
| `core/tenancy.py` | Request-scoped current tenant + user (thread-local). |
| `core/models.py` | `Organization`, `User` (email login, roles), `BaseModel` (tenant-scoped, no-delete, auto-audit), `CompanyProfile`, immutable `AuditLog`. |
| `core/middleware.py` | Sets the current tenant/user per request. |
| `core/audit.py` | Appends an audit row on every create/update. |
| `core/permissions.py` | Role → capability matrix + DRF permission class. |
| `fleet/settings_snippet.py` | Settings to merge (custom user, apps, middleware, DB, media). |

## The rules, enforced in code

- **Multi-tenancy** — every `BaseModel` subclass carries `organization`; the
  default manager (`objects`) auto-filters to the current tenant. Use
  `all_objects` to bypass (admin/migrations).
- **No hard delete** — `BaseModel.delete()` raises. Records are retired with
  `retire()` (status change). Vehicles/drivers override with domain statuses
  (`sold`, `scrapped`, `relieved`).
- **Immutable audit** — `AuditLog` rows can't be updated or deleted; each
  create/update writes one with the user, timestamp, and before→after diff.
- **Permissions** — `permissions.can(user, capability)` is the single check;
  e.g. `upload_logo` and `edit_company_profile` are Admin-only.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# start a Django project around this if you don't have one:
django-admin startproject fleet .
# then merge fleet/settings_snippet.py into fleet/settings.py

python manage.py makemigrations core
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

> `AUTH_USER_MODEL = "core.User"` must be set **before** the first migration.

## Build order from here (v1)

1. **Foundation** — this package. ✅
2. **Masters** — `vehicles`, `drivers` apps (subclass `BaseModel`). ✅
3. **Compliance + reminders** — documents with `valid_till`; a daily job that
   surfaces what's due; dashboard alerts.
4. **Daily operations** — trip sheet / work sheet (multi-leg), fuel log.
5. **Economics** — per-vehicle P&L + the calculator tab + dashboard P&L.

Each new master is just a `BaseModel` subclass, so it inherits tenancy,
no-delete, and audit for free.
