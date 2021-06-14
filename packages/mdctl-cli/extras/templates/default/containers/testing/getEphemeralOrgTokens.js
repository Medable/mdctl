let tokens = {
  JEST_TOKEN: process.env.JEST_TOKEN,
  JEST_API_KEY: process.env.JEST_API_KEY,
  JEST_ENV: process.env.JEST_ENV
}

console.log(JSON.stringify(tokens, null, 2))
