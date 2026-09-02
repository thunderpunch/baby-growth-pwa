# Security model

This repository contains only the static application shell. Baby records are stored locally in the browser/PWA IndexedDB and are not uploaded to GitHub Pages by this application.

## Public-hosting hardening

- No analytics, ads, remote fonts, CDNs, Firebase, Supabase, or cloud database.
- Content Security Policy allows application resources and network connections only to the same origin.
- No external frames, objects, forms, media, or third-party connections.
- The service worker ignores cross-origin requests.
- Referrer is disabled.
- Search-engine indexing is discouraged with `robots.txt` and `noindex` metadata.
- Imported JSON is validated for schema, field types, date/time formats, lengths, enums, numeric ranges, duplicate IDs, and size before merge.
- Imported values are escaped before HTML rendering in places that use template HTML.
- Records use stable IDs and timestamps for idempotent import merging.

## Important boundary

If an attacker gains write access to the GitHub repository, they could replace same-origin JavaScript and a future online reload could access the same-origin IndexedDB. Protect the GitHub account with a strong unique password and two-factor authentication. Do not commit exported baby-data JSON files to this repository.
