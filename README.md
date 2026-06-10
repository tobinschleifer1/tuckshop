<div align="center">

```
████████╗██╗   ██╗ ██████╗██╗  ██╗    ███████╗██╗  ██╗ ██████╗ ██████╗
╚══██╔══╝██║   ██║██╔════╝██║ ██╔╝    ██╔════╝██║  ██║██╔═══██╗██╔══██╗
   ██║   ██║   ██║██║     █████╔╝     ███████╗███████║██║   ██║██████╔╝
   ██║   ██║   ██║██║     ██╔═██╗     ╚════██║██╔══██║██║   ██║██╔═══╝
   ██║   ╚██████╔╝╚██████╗██║  ██╗    ███████║██║  ██║╚██████╔╝██║
   ╚═╝    ╚═════╝  ╚═════╝╚═╝  ╚═╝    ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝
```

### Rathkeale College Tuck Shop Pre-order System

*Skip the queue. Order ahead. Collect at break.*

<br>

![Status](https://img.shields.io/badge/status-alpha-orange?style=for-the-badge)
![Sprint](https://img.shields.io/badge/sprint-1%20of%203-8B1A1A?style=for-the-badge)
![License](https://img.shields.io/badge/license-NCEA%20Internal-1B4D2E?style=for-the-badge)

<br>

![Node](https://img.shields.io/badge/Node.js-22.5+-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.18-000000?style=flat-square&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-built--in-003B57?style=flat-square&logo=sqlite&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

<br>

[**Quick Start**](#-quick-start) • [**Features**](#-features) • [**Architecture**](#-architecture) • [**API**](#-api-reference) • [**Roadmap**](#-roadmap)

</div>

---

<div align="center">

### The Problem

> *Lunchtime queues at the tuck shop chew through half the break — and by the time some students get to the counter, the pies are gone.*

### The Solution

> *Order from your phone in homeroom. Pick it up the moment break starts. Done.*

</div>

---

## Quick Start

```bash
# 1. Clone & enter
git clone <your-repo-url>
cd tuckshop

# 2. Install
npm install

# 3. Run
node server.js
```

Then open one of these in your browser:

<table>
<tr>
<td align="center" width="33%">
  
**Student App**
  
[`localhost:3000/login.html`](http://localhost:3000/login.html)
  
*Order food*
  
</td>
<td align="center" width="33%">
  
**Staff Dashboard**
  
[`localhost:3000/staff.html`](http://localhost:3000/staff.html)
  
*Manage orders*
  
</td>
<td align="center" width="33%">
  
**Architecture**
  
[`localhost:3000/architecture.html`](http://localhost:3000/architecture.html)
  
*See the design*
  
</td>
</tr>
</table>

> **Heads up:** requires Node v22.5 or later. No native build step — SQLite is bundled into Node.

---

## Features

<table>
<tr>
<td valign="top" width="50%">

### Student Side

```
[*] Login by school number
[*] No password required
[*] Live menu grid
[*] Plus/minus quantity controls
[*] Real-time running total
[*] Morning Tea / Lunch toggle
[*] Sold-out items shown but disabled
[*] Itemised order confirmation
[*] Full receipt on success
```

</td>
<td valign="top" width="50%">

### Staff Side

```
[*] Real-time order dashboard
[*] Filter: All / Morning Tea / Lunch
[*] Live pending & collected stats
[*] Student avatar on each card
[*] Break-time colour tags
[*] One-tap "Mark Collected"
[*] Faded card on collection
[*] Auto-refresh after action
```

</td>
</tr>
</table>

---

## Architecture

```
                        ┌────────────────────────────────────┐
                        │            BROWSER LAYER           │
                        │  login → menu → confirm → success  │
                        │         staff dashboard            │
                        └─────────────┬──────────────────────┘
                                      │
                                      │  HTTP / JSON
                                      ▼
                        ┌────────────────────────────────────┐
                        │           SERVER LAYER             │
                        │       Express + Node.js            │
                        │                                    │
                        │  GET /api/student/:schoolNumber    │
                        │  GET /api/menu                     │
                        │  POST /api/order                   │
                        │  GET /api/orders                   │
                        │  PUT /api/orders/:id/collected     │
                        └─────────────┬──────────────────────┘
                                      │
                                      │  SQL
                                      ▼
                        ┌────────────────────────────────────┐
                        │          DATABASE LAYER            │
                        │       SQLite (node:sqlite)         │
                        │                                    │
                        │   students   menu_items   orders   │
                        └────────────────────────────────────┘
```

---

## Project Structure

```
tuckshop/
│
├── server.js                  Express server + 5 API routes
├── database.js                SQLite setup + seed data
├── package.json               Dependencies (Express only)
├── tuckshop.db                Created on first run
│
└── public/
    ├── style.css              Shared styles
    │
    │   ── Student flow ──
    ├── login.html             Login screen
    ├── menu.html              Menu grid + qty controls
    ├── confirm.html           Order summary
    ├── success.html           Receipt
    │
    │   ── Staff ──
    ├── staff.html             Dashboard
    │
    │   ── Docs ──
    ├── planning.html          Trello-style sprint board
    └── architecture.html      Whiteboard diagram
```

---

## Tech Stack

<table>
<tr>
<th>Layer</th>
<th>Choice</th>
<th>Why</th>
</tr>
<tr>
<td><b>Runtime</b></td>
<td>Node.js 22+</td>
<td>Built-in SQLite — no native compile step needed</td>
</tr>
<tr>
<td><b>Server</b></td>
<td>Express 4</td>
<td>Tiny, fast, perfect for a REST API of this size</td>
</tr>
<tr>
<td><b>Database</b></td>
<td>SQLite (node:sqlite)</td>
<td>File-based, zero-config, ships with Node</td>
</tr>
<tr>
<td><b>Frontend</b></td>
<td>Plain HTML / CSS / JS</td>
<td>No framework overhead; loads instantly on school WiFi</td>
</tr>
<tr>
<td><b>State</b></td>
<td>sessionStorage</td>
<td>Persists across pages without a cookie or login system</td>
</tr>
</table>

---

## Brand Palette

<table>
<tr>
<td align="center" bgcolor="#8B1A1A" width="20%"><br><b><code>#8B1A1A</code></b><br><sub>Rathkeale Red</sub><br>Primary buttons, nav<br><br></td>
<td align="center" bgcolor="#1B4D2E" width="20%"><br><b><code>#1B4D2E</code></b><br><sub>Forest Green</sub><br>Success, confirm<br><br></td>
<td align="center" bgcolor="#F5F0EB" width="20%"><br><b><code>#F5F0EB</code></b><br><sub>Parchment</sub><br>Page background<br><br></td>
<td align="center" bgcolor="#EAF3DE" width="20%"><br><b><code>#EAF3DE</code></b><br><sub>Light Success</sub><br>Success states<br><br></td>
<td align="center" bgcolor="#FCEBEB" width="20%"><br><b><code>#FCEBEB</code></b><br><sub>Light Error</sub><br>Error messages<br><br></td>
</tr>
</table>

---

## Test Data

<details>
<summary><b>Click to see test student logins</b></summary>

<br>

| School No. | Student              |
| :--------: | -------------------- |
| `12345`    | James Tanner         |
| `23456`    | Liam Murphy          |
| `34567`    | Noah Fitzpatrick     |
| `45678`    | Oliver Ryan          |
| `56789`    | Ethan O'Brien        |

</details>

<details>
<summary><b>Click to see the seeded menu</b></summary>

<br>

| Item                       | Price    | Status      |
| -------------------------- | -------: | :---------: |
| Meat Pie                   | `$3.50`  | Available   |
| Sausage Roll               | `$3.00`  | Available   |
| Ham Sandwich               | `$4.00`  | Available   |
| Cheese & Vegemite Roll     | `$3.50`  | Available   |
| Chicken Wrap               | `$5.00`  | Available   |
| Hot Dog                    | `$3.00`  | Available   |
| Fruit Cup                  | `$2.50`  | Available   |
| Chocolate Milk             | `$2.00`  | Available   |
| Water Bottle               | `$1.50`  | Available   |
| Muesli Bar                 | `$1.50`  | **Sold out**|

</details>

---

## API Reference

<table>
<tr>
<th>Method</th>
<th>Endpoint</th>
<th>Description</th>
</tr>
<tr>
<td><code>GET</code></td>
<td><code>/api/student/:schoolNumber</code></td>
<td>Look up a student by school number</td>
</tr>
<tr>
<td><code>GET</code></td>
<td><code>/api/menu</code></td>
<td>Fetch all menu items (available + sold out)</td>
</tr>
<tr>
<td><code>POST</code></td>
<td><code>/api/order</code></td>
<td>Place a new order</td>
</tr>
<tr>
<td><code>GET</code></td>
<td><code>/api/orders?break=morning_tea</code></td>
<td>List all orders, optionally filtered by break</td>
</tr>
<tr>
<td><code>PUT</code></td>
<td><code>/api/orders/:id/collected</code></td>
<td>Mark an order as collected</td>
</tr>
</table>

---

## Database Schema

<details>
<summary><b>students</b></summary>

| Column          | Type      | Notes                  |
| --------------- | --------- | ---------------------- |
| `id`            | INTEGER   | Primary key            |
| `school_number` | TEXT      | Unique                 |
| `name`          | TEXT      | Full name              |
| `photo_url`     | TEXT      | Optional profile photo |

</details>

<details>
<summary><b>menu_items</b></summary>

| Column      | Type      | Notes                          |
| ----------- | --------- | ------------------------------ |
| `id`        | INTEGER   | Primary key                    |
| `name`      | TEXT      | Item name                      |
| `price`     | REAL      | NZD                            |
| `available` | INTEGER   | `0` = sold out, `1` = on sale  |

</details>

<details>
<summary><b>orders</b></summary>

| Column          | Type      | Notes                                  |
| --------------- | --------- | -------------------------------------- |
| `id`            | INTEGER   | Primary key                            |
| `school_number` | TEXT      | References `students.school_number`    |
| `break_time`    | TEXT      | `morning_tea` or `lunch`               |
| `items`         | TEXT      | JSON string of cart items              |
| `total`         | REAL      | Order total in NZD                     |
| `date`          | TEXT      | ISO 8601 timestamp                     |
| `collected`     | INTEGER   | `0` = pending, `1` = done              |

</details>

---

## Roadmap

<table>
<tr>
<th align="left" width="33%">
  
**ALPHA — Sprint 1**
  
*shipped*

</th>
<th align="left" width="33%">
  
**BETA — Sprint 2**

*coming up*

</th>
<th align="left" width="33%">
  
**DELTA — Sprint 3**

*final polish*

</th>
</tr>
<tr>
<td valign="top">

- Core student order flow
- Staff dashboard
- SQLite storage
- API layer
- Mobile-first layout
- Sold-out handling

</td>
<td valign="top">

- Form validation
- Cutoff time (orders close end of day)
- Staff password auth
- Toast notifications
- Empty-state polish
- Edge-case error handling

</td>
<td valign="top">

- Student photos in DB
- Order history per student
- Daily export for staff
- Smooth animations
- Live dashboard updates
- Accessibility pass

</td>
</tr>
</table>

---

## Development Process

This project follows an **iterative, sprint-based workflow**, tracked on Trello and committed in logical chunks.

```
   Plan  ──►  Build  ──►  Test  ──►  Debug  ──►  Showcase  ──►  Commit
     ▲                                                              │
     └──────────────────────────────────────────────────────────────┘
```

**Sprint board:** [trello.com/b/LBF92Idg/dgt-tuck](https://trello.com/b/LBF92Idg/dgt-tuck)

---

## Coding Style

Code follows the **[Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)**.

```js
/**
 * Multiline JSDoc comments for file headers and route descriptions.
 */
app.get('/api/student/:schoolNumber', (req, res) => {
  // Single line comments sit on their own line above the code
  const student = db
    .prepare('SELECT * FROM students WHERE school_number = ?')
    .get(req.params.schoolNumber);

  // FIXME: needs error handling for malformed school numbers
  // TODO: add a rate limit before going to production

  res.json(student);
});
```

---

<div align="center">

### Built for Rathkeale College

*Year 13 Digital Technologies Internal Assessment*

<br>

`91906 — Use complex programming techniques to develop a computer program`

<br>

Made with `vanilla JS`, `SQLite`, and quiet library time.

</div>
