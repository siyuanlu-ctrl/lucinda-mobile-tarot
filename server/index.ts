import 'dotenv/config';
import app from './app';

const port = Number(process.env.PORT ?? 8787);

app.listen(port, () => {
  console.log(`Lucinda tarot backend listening on http://127.0.0.1:${port}`);
});
