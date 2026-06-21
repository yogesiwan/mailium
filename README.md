# Mailium

A self-hosted email campaign management app modeled after Mailmeteor, built for cold-emailing workflows with custom recipient filtering and campaign templates.

## Tech Stack

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Nodemailer + Gmail API (OAuth2)
- Agenda.js (MongoDB-backed job scheduling)

### Frontend
- React (Vite)
- TipTap (Rich Text Editor)
- React Router
- Lucide React (Icons)

## Setup Instructions

1. Clone the repository
2. Navigate to `server` and run `npm install`
3. Ensure `.env` is configured properly in `server/.env`
4. Run `npm start` (or `npm run dev` if configured) in the `server` directory
5. Navigate to `client` and run `npm install`
6. Run `npm run dev` in the `client` directory
7. Access the app at `http://localhost:5173`
