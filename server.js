const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const HFILE = path.join(DATA_DIR, 'highscores.json');
const MAX_ENTRIES = 10;

async function ensureDataFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(HFILE);
    } catch (err) {
      await fs.writeFile(HFILE, '[]', 'utf8');
    }
  } catch (err) {
    console.error('Failed to ensure data file', err);
  }
}

async function readScores() {
  await ensureDataFile();
  const raw = await fs.readFile(HFILE, 'utf8');
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch (e) {
    return [];
  }
}

async function writeScores(arr) {
  await ensureDataFile();
  await fs.writeFile(HFILE, JSON.stringify(arr, null, 2), 'utf8');
}

app.get('/api/highscores', async (req, res) => {
  try {
    const scores = await readScores();
    res.json(scores.slice(0, MAX_ENTRIES));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not read highscores' });
  }
});

app.post('/api/highscores', async (req, res) => {
  try {
    const { name, score } = req.body || {};
    if (typeof score !== 'number' || !isFinite(score) || score < 0) {
      return res.status(400).json({ error: 'Invalid score' });
    }
    let n = String(name || '').trim().slice(0,8);
    if (!n) n = '???';
    // sanitize: allow basic chars, space, dash, underscore
    n = n.replace(/[^A-Za-z0-9 _-]/g, '');

    const now = new Date().toISOString();

    const scores = await readScores();
    scores.push({ name: n, score: Math.floor(score), date: now });
    scores.sort((a,b) => b.score - a.score);
    const trimmed = scores.slice(0, MAX_ENTRIES);
    await writeScores(trimmed);
    res.json(trimmed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save highscore' });
  }
});

app.listen(PORT, () => {
  console.log(`Highscores API listening on http://localhost:${PORT}`);
});
