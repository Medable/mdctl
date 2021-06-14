import Api from './index'


const adminClient = Api(__API__)
const anonymousClient = adminClient.anonymousClient()

describe('anonymous client', () => {
  it('can fetch org', async() => {
    const org = await anonymousClient.get('org')
    expect(org).toBeDefined()
  })
  it('will get error when fetching me', async() => {
    expect.assertions(1)
    try {
      const me = await anonymousClient.get('accounts/me')
    } catch (e) {
      expect(e.errCode).toBe('cortex.accessDenied.notLoggedIn')
    }
  })
})
