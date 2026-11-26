'use strict';

const path = require('path');
const { createApp } = require('./src/app');
const { createDb } = require('./src/db');

const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json');
const db = createDb(dataFile);
db.load();

const port = Number(process.env.PORT) || 3000;
const app = createApp(db);
app.listen(port, () => {
  console.log(`متجر غرام شغال على http://localhost:${port}`);
});
