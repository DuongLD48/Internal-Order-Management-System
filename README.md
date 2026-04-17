# Internal Order Management System

Internal order management frontend built with Vite, Vanilla JavaScript, Firebase Authentication, and Cloud Firestore.

## Features

- Email/password login with Firebase Authentication
- Firestore-backed order list, search, filters, detail drawer, and logs
- Excel paste import flow for `SDR`, `BATT`, `BFG`, and `MTB`
- Batch create from import preview with duplicate protection
- Print, reprint, complete, cancel, and edit order actions
- User management for Firestore profile documents
- GitHub Pages deployment workflow

## Environment variables

Create `.env` from `.env.example` and fill:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Local development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Firebase setup

1. Create a Firebase project
2. Enable `Authentication > Sign-in method > Email/Password`
3. Create `Cloud Firestore` in Native mode
4. Add a Web App and copy config into `.env`
5. Create at least one Auth user
6. Create `users/{uid}` profile documents with role and active state

## Firestore model

- `users/{uid}`
- `orders/{orderId}`
- `orders/{orderId}/logs/{logId}`

## Recommended roles

- `admin`: full access
- `staff`: print, complete, cancel, view
- `viewer`: read-only order and log access

## Firestore security rules and indexes

- Rules file: [firestore.rules](./firestore.rules)
- Index file: [firestore.indexes.json](./firestore.indexes.json)

Deploy with Firebase CLI:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## GitHub Pages deployment

Workflow file: [deploy-pages.yml](./.github/workflows/deploy-pages.yml)

Setup:

1. Push repository to GitHub
2. Enable `Settings > Pages > Build and deployment > GitHub Actions`
3. Add repository secrets:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. Push to `main`
5. GitHub Actions will build and deploy `dist/`
