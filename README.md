# Rathkeale Tuck Shop — Pre-order System

A web-based pre-order system that lets Rathkeale College students order food from the school tuck shop before break, and lets staff manage incoming orders from a separate dashboard.

> **Status:** Alpha (Sprint 1) — fully functional first iteration with no error handling. Beta and Delta releases will follow.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Test Data](#test-data)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Roadmap](#roadmap)

---

## Overview

Long lunch queues at the tuck shop waste student break time. This system solves that by letting students pre-order food from their phone, then collect it at break. Staff get a real-time dashboard showing every pending order so they can prepare orders ahead of time and tick them off as collected.

The app has two completely separate sides:

| Side          | Who it's for       | Pages                                     |
| ------------- | ------------------ | ----------------------------------------- |
| **Student**   | Rathkeale students | Login → Menu → Confirm → Success          |
| **Staff**     | Tuck shop staff    | Dashboard with filter tabs                |

---

## Features

**Student side**
- Log in with school number — no password needed
- Live-updating menu grid with quantity controls
- Choose between Morning Tea or Lunch
- Sold-out items shown but cannot be ordered
- Running total updates as items are added
- Itemised confirmation screen before submitting
- Receipt shown after successful order

**Staff side**
- Real-time dashboard of all incoming orders
- Filter by All / Morning Tea / Lunch
- Live stat cards showing pending and collected counts
- One-tap "Mark Collected" with visual fade-out feedback

---

## Tech Stack

| Layer       | Technology                                    |
| ----------- | --------------------------------------------- |
| Backend     | Node.js + Express                             |
| Database    | SQLite (via Node's built-in `node:sqlite`)    |
| Frontend    | HTML, CSS, vanilla JavaScript                 |
| Storage     | Browser `sessionStorage` for cart state       |

No build step, no frontend framework, no external database. The whole app runs from a single `node server.js` command.

---

## Project Structure

```
tuckshop/
├── server.js              Express server and API routes
├── database.js            SQLite setup and seed data
├── package.json           Dependencies (Express only)
├── tuckshop.db            SQLite database file (created on first run)
└── public/
    ├── login.html         Student/staff entry point
    ├── menu.html          Menu grid and quantity controls
    ├── confirm.html       Order summary screen
    ├── success.html       Order receipt
    ├── staff.html         Staff dashboard
    ├── planning.html      Sprint 1 Trello-style planning board
    ├── architecture.html  Whiteboard-style architecture diagram
    └── style.css          All shared styles
```

---

## Getting Started

### Prerequisites
- Node.js v22.5 or later (for the built-in `node:sqlite` module)

### Installation

```bash
# Clone the repo and enter the folder
git clone <your-repo-url>
cd tuckshop

# Install dependencies
npm install
```

### Running

```bash
node server.js
```

Then open your browser:

| URL                                              | Page                |
| ------------------------------------------------ | ------------------- |
| `http://localhost:3000/login.html`              | Student login       |
| `http://localhost:3000/staff.html`              | Staff dashboard     |
| `http://localhost:3000/planning.html`           | Sprint 1 plan       |
| `http://localhost:3000/architecture.html`       | Architecture diagram|

The database is seeded automatically on first run.

---

## Test Data

The database ships with five test students and ten menu items.

**Test student logins**

| School No. | Name                |
| ---------- | ------------------- |
| `12345`    | James Tanner        |
| `23456`    | Liam Murphy         |
| `34567`    | Noah Fitzpatrick    |
| `45678`    | Oliver Ryan         |
| `56789`    | Ethan O'Brien       |

**Sample menu**

| Item                     | Price  | Status     |
| ------------------------ | ------ | ---------- |
| Meat Pie                 | $3.50  | Available  |
| Sausage Roll             | $3.00  | Available  |
| Ham Sandwich             | $4.00  | Available  |
| Cheese & Vegemite Roll   | $3.50  | Available  |
| Chicken Wrap             | $5.00  | Available  |
| Hot Dog                  | $3.00  | Available  |
| Fruit Cup                | $2.50  | Available  |
| Chocolate Milk           | $2.00  | Available  |
| Water Bottle             | $1.50  | Available  |
| Muesli Bar               | $1.50  | Sold Out   |

---

## How It Works

```
   ┌─────────────────┐    HTTP/JSON    ┌─────────────────┐    SQL    ┌─────────────┐
   │   Browser       │ ──────────────► │   Express API   │ ────────► │   SQLite    │
   │ (HTML/CSS/JS)   │ ◄────────────── │   (server.js)   │ ◄──────── │  (.db file) │
   └─────────────────┘                 └─────────────────┘           └─────────────┘
```

1. Student opens the login page and enters their school number.
2. The browser calls `GET /api/student/:schoolNumber` to look up the student.
3. The student's details are saved in `sessionStorage` so other pages can use them.
4. The menu page calls `GET /api/menu` and renders the item grid.
5. As the student taps `+` or `−` buttons, the cart and running total update in JS — no server calls.
6. On confirm, the browser sends `POST /api/order` with the full cart and break time.
7. The staff dashboard polls `GET /api/orders` to show pending and collected orders, and uses `PUT /api/orders/:id/collected` to mark them done.

---

## API Reference

| Method | Endpoint                          | Purpose                                  |
| ------ | --------------------------------- | ---------------------------------------- |
| GET    | `/api/student/:schoolNumber`     | Look up a student by school number       |
| GET    | `/api/menu`                      | Get all menu items (available + sold out)|
| POST   | `/api/order`                     | Place a new order                        |
| GET    | `/api/orders?break=morning_tea`  | List all orders (optional break filter)  |
| PUT    | `/api/orders/:id/collected`      | Mark an order as collected               |

---

## Database Schema

### `students`
| Column          | Type    | Notes                  |
| --------------- | ------- | ---------------------- |
| id              | INTEGER | Primary key            |
| school_number   | TEXT    | Unique student ID      |
| name            | TEXT    | Full name              |
| photo_url       | TEXT    | Optional profile photo |

### `menu_items`
| Column     | Type    | Notes                          |
| ---------- | ------- | ------------------------------ |
| id         | INTEGER | Primary key                    |
| name       | TEXT    | Item name                      |
| price      | REAL    | Price in NZD                   |
| available  | INTEGER | 0 = sold out, 1 = available    |

### `orders`
| Column         | Type    | Notes                                       |
| -------------- | ------- | ------------------------------------------- |
| id             | INTEGER | Primary key                                 |
| school_number  | TEXT    | References the student                     |
| break_time     | TEXT    | `morning_tea` or `lunch`                   |
| items          | TEXT    | JSON string of items in the order          |
| total          | REAL    | Order total in NZD                         |
| date           | TEXT    | ISO 8601 timestamp                         |
| collected      | INTEGER | 0 = pending, 1 = collected                 |

---

## Roadmap

This is the **Alpha (Sprint 1)** release — focused on core functionality.

**Planned for Beta (Sprint 2)**
- Input validation and error handling on all forms
- Cutoff time check so orders cannot be placed after the school day ends
- Staff password authentication
- Toast notifications for success and error states

**Planned for Delta (Sprint 3)**
- Student profile photos in the database
- Order history per student
- Daily order summary export for staff
- Polished animations and refined UI
- Real-time dashboard updates (no manual refresh)

---

## Credits

Built by Toby Schleif as a Year 13 Digital Technologies internal assessment at Rathkeale College.

Branding follows the official Rathkeale dark red (`#8B1A1A`) and forest green (`#1B4D2E`) colour scheme.
