
const { assert } = require('chai'),
      { CredentialsProvider, CredentialsManager } = require('../../../src/lib/api/credentials'),
      MemoryProvider = require('../../../src/lib/api/memory-provider'),
      testEntries = {
        password: {
          environment: 'api.test.medable.com/test',
          input: {
            username: 'test@medable.com',
            password: 'password'
          }
        },
        signature: {
          environment: 'api.test.medable.com/test',
          input: {
            key: 'abcdefghijklmnopqrstuv',
            secret: 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01'
          }
        },
        token: {
          environment: 'api.test.medable.com/test',
          input: {
            token: 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCIsInR5cGUiOiJKV1QifQ.eyJhdWQiOiJodHRwczovL2'
              + 'FwaS5zYXMubWVkYWJsZS5jb20vbWVkYWJsZS92MiIsImlzcyI6IndiMENONkhBbnJyNVBjalNhdVl1dFUi'
              + 'LCJpYXQiOjE1NDgwOTM5NjksImV4cCI6MTU0ODA5NDg2OSwic3ViIjoiMDAwMDAwMDAwMDAwMDAwMDAwMD'
              + 'AwMDAyIiwiY29ydGV4L2VtbCI6ImphbWVzQG1lZGFibGUuY29tIn0.fSKNEwZSPXPl2waooErRggxqDZ2b'
              + 'TWlIYgWuP5EUkRcr5CIJXtLsUTW1Vd7Yf5DqsEmBZbxoo5YwPmrNfp6aSh99zoVr57V1NciPhm0LZbhd_x'
              + 'fAE6xAM126Uq1MYnBYb-hMJx7YknG2xxB-qcUJGxXNXWOe6QdF0wqNqkpUJHIITpcYBu-GkORr3ReR5sTp'
              + 'ivYwwXLXvQTgt5cDA_w9i2JO7oi1RCnn9goZhoMbY40lHzIGTL1o1T7KWcZVwqygdTjLIIYX-n0oo5CnB7'
              + 'r7SJqRr8j1Jbfyf1QmuHJexC8hWCasoTi55Z4PWsdLXq9yOgF7gHxhFhluItfs9LPESw'
          }
        },
        tokenNoEmail: {
          environment: 'api.test.medable.com/test',
          input: {
            token: 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCIsInR5cGUiOiJKV1QifQ.eyJhdWQiOiJodHRwczovL2'
            + 'FwaS5zYXMubWVkYWJsZS5jb20vbWVkYWJsZS92MiIsImlzcyI6IndiMENONkhBbnJyNVBjalNhdVl1dFUi'
            + 'LCJpYXQiOjE1NDgwOTQwMjAsImV4cCI6MTU0ODA5NDkyMCwic3ViIjoiMDAwMDAwMDAwMDAwMDAwMDAwMD'
            + 'AwMDAyIn0.KI_QqFgEMoii9sVg_tx2y13RjbTqkqMfMQ0SgI-vyVYb86hDJGS6AaM3-QYzmflHwcRpmex_'
            + 'dVupOxLHa6Eq-woeBo0hYOwIEdgJRtVKkgi5HzUpQad-3JsAdDPyVE8XJE7WE2BgvZ63bwTPQt6r47JJu2'
            + 'MPw_yy-OFlfohZYVFfgbG5tmloRUu6_IP4oSeVEW8IcFYiVqA-Pt5iUAWlXe9cBzz0lNEtP_lgwee_1omB'
            + 'lpO_VtCfZGofRfYV_AeSGJ9zw4GZk-qVomnG_3zYMwOUYgAvA-x_jXK6PIQ9pvW_WzSH6Y_snmJn08uTte'
            + 'b79sXKqnQ-ZL_LKXPT5MzVLA'
          }
        }
      }

describe('CLI - Credentials', () => {

  let originalProvider

  // eslint-disable-next-line no-undef
  before((callback) => {

    originalProvider = CredentialsProvider.get()
    CredentialsProvider.set(new MemoryProvider())
    callback()

  })

  // eslint-disable-next-line no-undef
  after((callback) => {

    CredentialsProvider.set(originalProvider)
    callback()
  })

  it('should find entries', async() => {

    const { password } = testEntries

    await CredentialsManager.clear()
    await CredentialsManager.add(password.environment, password.input)

    assert((await CredentialsManager.list(
      password.environment, {
        type: 'password',
        username: password.input.username
      }
    )).length === 1, 'list should have 1 entry.')

  })

  it('should add and clear entries', async() => {

    await CredentialsManager.clear()
    assert((await CredentialsManager.list()).length === 0, 'list should be empty')

    const { password, signature, token } = testEntries

    await CredentialsManager.add(password.environment, password.input)
    await CredentialsManager.add(signature.environment, signature.input)
    await CredentialsManager.add(token.environment, token.input)

    assert((await CredentialsManager.list()).length === 3, 'list should have entries.')
    assert((await CredentialsManager.clear({ type: 'token' })) === 1, 'list should have cleared 1 entry.')
    assert((await CredentialsManager.clear({ username: 'test@medable.com' })) === 1, 'list should have cleared 1 entry.')
    assert((await CredentialsManager.clear()) === 1, 'list should have cleared 1 entry.')
    assert((await CredentialsManager.list()).length === 0, 'list should be empty.')

  })

})
