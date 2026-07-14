// Мини-сервер: слушает HTTP на порту 80 и редиректит на HTTPS (порт 443,
// поэтому в адресе он не указывается). Нужен, чтобы можно было заходить
// на dev-стенд просто по IP/hostname без протокола — браузер по умолчанию
// бьёт на http://, а мы его сразу перенаправляем на https://.
import http from 'node:http';

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  res.writeHead(301, { Location: `https://${host}${req.url}` });
  res.end();
});

server.listen(80, '0.0.0.0', () => {
  console.log('HTTP→HTTPS redirect listening on :80');
});
