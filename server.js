/**
 * server.js
 * Express server for the Rathkeale Tuck Shop pre-order system.
 * Serves static HTML pages and provides a JSON API for the frontend.
 */

const express = require('express');
const db = require('./database');

// Load environment variables from a local .env file if one exists.
// This keeps secrets like the staff password out of the source code.
try {
  process.loadEnvFile();
} catch {
  // No .env file present — fall back to real env vars or the placeholder default
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware — parse JSON request bodies and serve static files from /public
app.use(express.json());
app.use(express.static('public'));

// The staff password. Falls back to a default for local use, but can be
// overridden with the STAFF_PASSWORD environment variable so the real
// password never has to live in the public code.
// The real password lives in the gitignored .env file (or a real env var).
// This placeholder is only used if no .env is set up.
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'changeme';

// ─── STAFF AUTH ──────────────────────────────────────────────────────────────

/**
 * Check the staff password.
 * Expects: { password: "..." } and returns { success: true } if it matches.
 */
app.post('/api/staff/login', (req, res) => {
  const { password } = req.body;

  if (password === STAFF_PASSWORD) {
    return res.json({ success: true });
  }

  // 401 Unauthorised if the password is wrong
  res.status(401).json({ success: false, error: 'Incorrect password' });
});

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

/**
 * Return every student, sorted alphabetically by name.
 * Used by the staff import page to preview who is in the database.
 */
app.get('/api/students', (req, res) => {
  const students = db
    .prepare('SELECT * FROM students ORDER BY name COLLATE NOCASE ASC')
    .all();
  res.json(students);
});

/**
 * Delete one or more students by school number.
 * Expects: { school_numbers: ["12345", "23456", ...] }
 * Returns how many rows were actually removed.
 */
app.post('/api/students/delete', (req, res) => {
  const { school_numbers } = req.body;

  // Must be a non-empty array
  if (!Array.isArray(school_numbers) || school_numbers.length === 0) {
    return res.status(400).json({ error: 'No students selected' });
  }

  const del = db.prepare('DELETE FROM students WHERE school_number = ?');

  // Delete each selected student and count how many were removed
  let deleted = 0;
  for (const schoolNumber of school_numbers) {
    const result = del.run(schoolNumber);
    deleted += result.changes;
  }

  res.json({ success: true, deleted });
});

/**
 * Import a list of students from an uploaded CSV file.
 *
 * The browser reads the file as plain text and sends it here as { csv: "..." }.
 * The server then parses, sorts, and inserts the rows so all the file-handling
 * logic lives in one place on the backend.
 *
 * Expected CSV columns (a header row is required): school_number, name, photo_url
 * The photo_url column is optional.
 */
app.post('/api/students/import', (req, res) => {
  const { csv } = req.body;

  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'No CSV data received' });
  }

  // Parse the raw CSV text into an array of student objects
  const parsed = parseStudentCsv(csv);

  if (parsed.rows.length === 0) {
    return res.status(400).json({
      error: 'No valid student rows found. Check the column headers.',
    });
  }

  // Sort alphabetically by name before inserting so the database fills in order
  parsed.rows.sort((a, b) => a.name.localeCompare(b.name));

  // INSERT OR IGNORE skips any school_number that already exists (UNIQUE column)
  // so re-uploading the same file doesn't crash — it just adds the new students.
  const insert = db.prepare(
    'INSERT OR IGNORE INTO students (school_number, name, photo_url) VALUES (?, ?, ?)'
  );

  // Keep the actual students in each bucket so the staff can see exactly
  // which ones were added and which were already in the database.
  const addedList = [];
  const skippedList = [];

  for (const student of parsed.rows) {
    const result = insert.run(student.school_number, student.name, student.photo_url);
    // changes === 1 means a row was actually inserted; 0 means it was ignored
    if (result.changes === 1) {
      addedList.push({ school_number: student.school_number, name: student.name });
    } else {
      skippedList.push({ school_number: student.school_number, name: student.name });
    }
  }

  res.json({
    success: true,
    added: addedList.length,
    skipped: skippedList.length,
    invalid: parsed.invalid.length,
    // Full detail lists so the frontend boxes can be expanded
    addedList,
    skippedList,        // already existed in the database
    invalidList: parsed.invalid, // rows missing a school number or name, with the reason
  });
});

/**
 * Parse raw CSV text into student rows.
 *
 * Returns { rows, invalid } where rows is the list of valid students and
 * invalid is an array describing each bad line: { line, content, reason }.
 */
function parseStudentCsv(csv) {
  // Split into lines and drop any blank ones (handles Windows \r\n too)
  const lines = csv
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) return { rows: [], invalid: [] };

  // The first line is the header — work out which column is which
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const schoolIndex = headers.indexOf('school_number');
  const nameIndex = headers.indexOf('name');
  const photoIndex = headers.indexOf('photo_url');

  const rows = [];
  const invalid = [];

  // Loop over every line after the header
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(',').map(c => c.trim());

    const schoolNumber = schoolIndex >= 0 ? cells[schoolIndex] : '';
    const name = nameIndex >= 0 ? cells[nameIndex] : '';
    const photoUrl = photoIndex >= 0 ? cells[photoIndex] : null;

    // A row is only valid if it has both a school number and a name.
    // Record exactly why a row failed so the staff can fix it.
    if (!schoolNumber && !name) {
      invalid.push({ line: i + 1, content: lines[i], reason: 'Missing school number and name' });
      continue;
    }
    if (!schoolNumber) {
      invalid.push({ line: i + 1, content: lines[i], reason: 'Missing school number' });
      continue;
    }
    if (!name) {
      invalid.push({ line: i + 1, content: lines[i], reason: 'Missing name' });
      continue;
    }

    rows.push({
      school_number: schoolNumber,
      name,
      photo_url: photoUrl || null,
    });
  }

  return { rows, invalid };
}

// ─── MENU ROUTES ───────────────────────────────────────────────────────────

/**
 * Return all menu items (both available and sold out), including daily limits.
 * The frontend handles showing sold-out items as faded with no controls.
 */
app.get('/api/menu', (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items').all();
  res.json(items);
});

/**
 * Add a new menu item. (Staff)
 * Expects: { name, price, available, daily_limit }
 */
app.post('/api/menu', (req, res) => {
  const { name, price, available, daily_limit } = req.body;

  if (!name || price == null || isNaN(price)) {
    return res.status(400).json({ error: 'A name and a valid price are required' });
  }

  const result = db
    .prepare('INSERT INTO menu_items (name, price, available, daily_limit) VALUES (?, ?, ?, ?)')
    .run(name, Number(price), available ? 1 : 0, Number(daily_limit) || 0);

  res.json({ success: true, id: result.lastInsertRowid });
});

/**
 * Update an existing menu item — price, name, availability or daily limit. (Staff)
 */
app.put('/api/menu/:id', (req, res) => {
  const { name, price, available, daily_limit } = req.body;

  if (!name || price == null || isNaN(price)) {
    return res.status(400).json({ error: 'A name and a valid price are required' });
  }

  db.prepare(
    'UPDATE menu_items SET name = ?, price = ?, available = ?, daily_limit = ? WHERE id = ?'
  ).run(name, Number(price), available ? 1 : 0, Number(daily_limit) || 0, req.params.id);

  res.json({ success: true });
});

/**
 * Delete a menu item. (Staff)
 */
app.delete('/api/menu/:id', (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── ORDER ROUTES ──────────────────────────────────────────────────────────

/**
 * Generate a short, unique confirmation code (e.g. "K7QP2").
 * Ambiguous characters (0/O, 1/I/L) are left out so codes are easy to read aloud.
 */
function generateOrderCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Keep trying until we get a code not already used by another order
  } while (db.prepare('SELECT 1 FROM orders WHERE code = ?').get(code));
  return code;
}

/**
 * Place a new order.
 * Expects: { school_number, break_time, items: [{id, name, price, quantity}], total }
 *
 * Enforces each item's daily limit, then stores the order with a unique
 * confirmation code which is returned for the student to show at the counter.
 */
app.post('/api/order', (req, res) => {
  const { school_number, break_time, items, total } = req.body;

  // Basic check that all required fields are present before writing to the database
  if (!school_number || !break_time || !items || items.length === 0) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }

  // ── Enforce per-item daily limits ──
  // Work out how many of each item this student has already ordered today
  // (ignoring cancelled orders).
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const todaysOrders = db
    .prepare(
      'SELECT items FROM orders WHERE school_number = ? AND cancelled = 0 AND substr(date, 1, 10) = ?'
    )
    .all(school_number, today);

  const alreadyToday = {}; // menu item id -> quantity ordered so far today
  for (const row of todaysOrders) {
    for (const it of JSON.parse(row.items)) {
      alreadyToday[it.id] = (alreadyToday[it.id] || 0) + it.quantity;
    }
  }

  // Look up the limit for every menu item, keyed by id
  const menuItems = db.prepare('SELECT id, name, daily_limit FROM menu_items').all();
  const menuById = {};
  menuItems.forEach(m => { menuById[m.id] = m; });

  // Check each item in the new order against its limit (0 = no limit)
  for (const item of items) {
    const menu = menuById[item.id];
    if (!menu || menu.daily_limit === 0) continue;

    const already = alreadyToday[item.id] || 0;
    if (already + item.quantity > menu.daily_limit) {
      return res.status(400).json({
        error:
          `Daily limit reached for ${menu.name} — max ${menu.daily_limit} per day` +
          (already > 0 ? ` (you already have ${already} today).` : '.'),
      });
    }
  }

  // ── Store the order with a unique confirmation code ──
  const code = generateOrderCode();
  const itemsJson = JSON.stringify(items);
  const date = new Date().toISOString();

  // TODO: add a cutoff time check here so orders can't be placed after school ends
  const result = db
    .prepare(
      'INSERT INTO orders (school_number, break_time, items, total, date, collected, code, cancelled) VALUES (?, ?, ?, ?, ?, 0, ?, 0)'
    )
    .run(school_number, break_time, itemsJson, total, date, code);

  // Return the code so the student can show it to the staff
  res.json({ success: true, orderId: result.lastInsertRowid, code });
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

  // Parse JSON and convert SQLite's 0/1 integers into real booleans
  orders = orders.map(order => ({
    ...order,
    items: JSON.parse(order.items),
    collected: order.collected === 1,
    cancelled: order.cancelled === 1,
  }));

  res.json(orders);
});

/**
 * Look up a single order by its confirmation code. (Student status check)
 */
app.get('/api/order/:code', (req, res) => {
  const order = db
    .prepare('SELECT * FROM orders WHERE code = ?')
    .get(req.params.code.toUpperCase());

  if (!order) {
    return res.status(404).json({ error: 'No order found with that code' });
  }

  res.json({
    ...order,
    items: JSON.parse(order.items),
    collected: order.collected === 1,
    cancelled: order.cancelled === 1,
  });
});

/**
 * Mark an order as collected.
 * Called when the staff taps the "Collected" button on the dashboard.
 */
app.put('/api/orders/:id/collected', (req, res) => {
  db.prepare('UPDATE orders SET collected = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

/**
 * Cancel an order from the staff dashboard.
 * Records that staff cancelled it so the student can be told who did.
 */
app.put('/api/orders/:id/cancel', (req, res) => {
  db.prepare("UPDATE orders SET cancelled = 1, cancelled_by = 'staff' WHERE id = ?")
    .run(req.params.id);
  res.json({ success: true });
});

/**
 * Cancel an order from the student side, using their confirmation code.
 * A collected order can't be cancelled.
 */
app.put('/api/order/:code/cancel', (req, res) => {
  const order = db
    .prepare('SELECT * FROM orders WHERE code = ?')
    .get(req.params.code.toUpperCase());

  if (!order) {
    return res.status(404).json({ error: 'No order found with that code' });
  }
  if (order.collected === 1) {
    return res.status(400).json({ error: 'This order has already been collected and cannot be cancelled' });
  }
  if (order.cancelled === 1) {
    return res.status(400).json({ error: 'This order is already cancelled' });
  }

  db.prepare("UPDATE orders SET cancelled = 1, cancelled_by = 'student' WHERE id = ?")
    .run(order.id);
  res.json({ success: true });
});

// ─── START SERVER ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Tuck Shop server running at http://localhost:${PORT}`);
  console.log('Student login: http://localhost:3000/login.html');
  console.log('Staff dashboard: http://localhost:3000/staff.html');
});
