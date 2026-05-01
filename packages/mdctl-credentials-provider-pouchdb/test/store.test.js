/* eslint-env mocha */

const fs = require('fs'),
      path = require('path'),
      os = require('os'),
      { expect } = require('chai'),
      PouchDbCredentialsProvider = require('..')

const KEY = '0123456789abcdef0123456789abcdef'

function tmpName() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'mdctl-creds-')),
    'mdctl.db'
  )
}

describe('FileStore credentials provider', () => {

  it('round-trips a single credential', async() => {
    const name = tmpName(),
          provider = new PouchDbCredentialsProvider({ name, key: KEY })

    await provider.setCredentials('password', 'acct-a', 'hunter2')
    const list = await provider.getCredentials('password')

    expect(list).to.have.lengthOf(1)
    expect(list[0]).to.include({ type: 'service', service: 'password', account: 'acct-a', password: 'hunter2' })

    expect(fs.existsSync(`${name}.json`)).to.equal(true)
    expect(fs.existsSync(name)).to.equal(false)
  })

  it('upserts (single row per service+account)', async() => {
    const name = tmpName(),
          provider = new PouchDbCredentialsProvider({ name, key: KEY })

    await provider.setCredentials('password', 'acct-a', 'one')
    await provider.setCredentials('password', 'acct-a', 'two')
    await provider.setCredentials('password', 'acct-b', 'three')

    const list = await provider.getCredentials('password')
    expect(list).to.have.lengthOf(2)
    const a = list.find(r => r.account === 'acct-a')
    const b = list.find(r => r.account === 'acct-b')
    expect(a.password).to.equal('two')
    expect(b.password).to.equal('three')
  })

  it('deletes by service+account and reports whether removal happened', async() => {
    const name = tmpName(),
          provider = new PouchDbCredentialsProvider({ name, key: KEY })

    await provider.setCredentials('password', 'acct-a', 'one')

    const removed = await provider.deleteCredentials('password', 'acct-a')
    expect(removed).to.equal(true)
    const removedAgain = await provider.deleteCredentials('password', 'acct-a')
    expect(removedAgain).to.equal(false)

    expect(await provider.getCredentials('password')).to.have.lengthOf(0)
  })

  it('persists across provider instances', async() => {
    const name = tmpName()

    const a = new PouchDbCredentialsProvider({ name, key: KEY })
    await a.setCredentials('password', 'acct-a', 'hunter2')
    await a.close()

    const b = new PouchDbCredentialsProvider({ name, key: KEY })
    const list = await b.getCredentials('password')
    expect(list).to.have.lengthOf(1)
    expect(list[0].password).to.equal('hunter2')
  })

  it('rejects when re-opened with a wrong encryption key', async() => {
    const name = tmpName(),
          a = new PouchDbCredentialsProvider({ name, key: KEY })
    await a.setCredentials('password', 'acct-a', 'hunter2')

    const wrongKey = 'wrongkeywrongkeywrongkeywrongkey',
          b = new PouchDbCredentialsProvider({ name, key: wrongKey })

    let err
    try { await b.getCredentials('password') } catch (e) { err = e }
    expect(err).to.exist
    expect(err.message).to.match(/encryption key/i)
  })

  it('writes the json file with mode 0600', async function() {
    if (process.platform === 'win32') return this.skip()
    const name = tmpName(),
          provider = new PouchDbCredentialsProvider({ name, key: KEY })
    await provider.setCredentials('password', 'acct-a', 'hunter2')
    const stat = fs.statSync(`${name}.json`)
    // eslint-disable-next-line no-bitwise
    expect((stat.mode & 0o777)).to.equal(0o600)
  })

  it('does not store plaintext passwords on disk', async() => {
    const name = tmpName(),
          provider = new PouchDbCredentialsProvider({ name, key: KEY })
    await provider.setCredentials('password', 'acct-a', 'verysecretplaintext')
    const raw = fs.readFileSync(`${name}.json`, 'utf8')
    expect(raw).to.not.include('verysecretplaintext')
  })

  it('persists getCredentials result after re-load', async() => {
    const name = tmpName(),
          a = new PouchDbCredentialsProvider({ name, key: KEY })
    await a.setCredentials('token', 'acct-a', 'tok-a')
    await a.setCredentials('token', 'acct-b', 'tok-b')

    const b = new PouchDbCredentialsProvider({ name, key: KEY })
    const list = await b.getCredentials('token')
    expect(list.map(r => r.password).sort()).to.deep.equal(['tok-a', 'tok-b'])
  })

})
