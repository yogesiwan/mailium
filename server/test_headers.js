const express = require('express');
const app = express();
app.get('/test', (req, res) => {
  let rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log('Headers:', req.headers);
  console.log('Raw IP:', rawIp);
  res.send('ok');
});
app.listen(3000, () => console.log('Listening'));
