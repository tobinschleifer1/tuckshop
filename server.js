/**
 * server.js
 * Express server for the Rathkeale Tuck Shop pre-order system.
 * Serves static HTML pages and provides a JSON API for the frontend.
 */

const express = require('express');
const db = require('./database');

const app = express();
const PORT = 3000;

// Middleware — parse JSON request bodies and serve static files from /public
app.use(express.json());
app.use(express.static('public'));

// ─── STUDENT ROUTES ────────────────────────────────────────────────────────

/**
 * Look up a student by their school number.
 * Returns name and photo_url so the frontend can greet them by name.
 */
app.get('/api/student/:schoolNumber', (req, res) => {
  const student = db
    .prepare('SELECT * FROM students WHERE school_number = ?')
    .get(req.params.schoolNumber);

  if (!student) {
    // 404 if the school number doesn't match anyone in the database
    return res.status(404).json({ error: 'Student not found' });
  }

  res.json(student);
});

// ─── MENU ROUTES ───────────────────────────────────────────────────────────

/**
 * Return all menu items (both available and sold out).
 * The frontend handles showing sold-out items as faded with no controls.
 */
app.get('/api/menu', (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items').all();
  res.json(items);
});

// ─── ORDER ROUTES ──────────────────────────────────────────────────────────

/**
 * Place a new order.
 * Expects: { school_number, break_time, items: [{id, name, price, quantity}], total }
 */
app.post('/api/order', (req, res) => {
  const { school_number, break_time, items, total } = req.body;

  // Basic check that all required fields are present before writing to the database
  if (!school_number || !break_time || !items || items.length === 0) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }

  // Store items as a JSON string — SQLite doesn't have a native array type
  const itemsJson = JSON.stringify(items);
  const date = new Date().toISOString();

  // TODO: add a cutoff time check here so orders can't be placed after school ends
  const result = db
    .prepare(
      'INSERT INTO orders (school_number, break_time, items, total, date, collected) VALUES (?, ?, ?, ?, ?, 0)'
    )
    .run(school_number, break_time, itemsJson, total, date);

  res.json({ success: true, orderId: result.lastInsertRowid });
});

/**
 * Get all orders — used by the staff dashboard.
 * Optional query param ?break=morning_tea or ?break=lunch to filter by break time.
 */
app.get('/api/orders', (req, res) => {
  const { break: breakTime } = req.query;

  let orders;
  if (breakTime && breakTime !== 'all') {
    // Filter by break time if a specific break was requested
    orders = db
      .prepare('SELECT * FROM orders WHERE break_time = ? ORDER BY date DESC')
      .all(breakTime);
  } else {
    orders = db.prepare('SELECT * FROM orders ORDER BY date DESC').all();
  }

  // Parse the items JSON string back into an array for each order
  orders = orders.map(order => ({
    ...order,
    items: JSON.parse(order.items),

    // SQLite stores booleans as 0/1 integers — convert to true/false here
    collected: order.collected === 1,
  }));

  res.json(orders);
});

/**
 * Mark an order as collected.
 * Called when the staff taps the "Collected" button on the dashboard.
 */
app.put('/api/orders/:id/collected', (req, res) => {
  // FIXME: add staff authentication before this goes to production
  db.prepare('UPDATE orders SET collected = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── START SERVER ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Tuck Shop server running at http://localhost:${PORT}`);
  console.log('Student login: http://localhost:3000/login.html');
  console.log('Staff dashboard: http://localhost:3000/staff.html');
});
