import factoryBuilder from './index'
import ObjectBuilder from './base/object-builder'

const factory = factoryBuilder.build()

afterAll(async() => {
  factory.clean()
})

test.each([
  'c_anchor_date_template',
  'c_group_task',
  'c_group',
  'c_public_user',
  'c_query',
  'c_site_user',
  'c_site',
  'c_step_response',
  'c_step',
  'c_study',
  'c_task_assignment',
  'c_task_response',
  'c_task'
])('Factory builder can build %s', (objectType) => {
  const objectBuilder = factory.new[objectType]
  expect(objectBuilder)
    .toBeInstanceOf(ObjectBuilder)
})

describe('publicUser Builder', () => {
  let study,
      publicUser

  beforeAll(async() => {
    study = await factory.new.c_study.build()
  })

  it('It can build new participants through public signup', async() => {
    publicUser = await study.newChild.c_public_user
      .buildAsPublicSignup()

    expect(publicUser._id)
      .toBeDefined()
  })

  it('Can register participants', async() => {
    expect(publicUser.doResearchRegister)
      .toBeDefined()
    await publicUser.doResearchRegister()
    expect(publicUser.doResearchRegister).not.toBeDefined()

    const account = await publicUser.client.get('accounts/me?expand=c_public_users')
    // Sanity check: account should be linked to public user.
    expect(account.c_public_users.data.length)
      .toBe(1)
    expect(account.c_public_users.data[0]._id)
      .toBe(publicUser._id)
  })
})

describe('account Builder building accounts', () => {
  let account

  beforeAll(async() => {
    account = await factory.new.account.build()
  })

  it('builds basic accounts', async() => {
    expect(account._id)
      .toBeDefined()
    const result = await account.client.get('accounts/me')
    expect(result.roles.length)
      .toBe(0)
  })

  it('has a logged in client', async() => {
    const result = await account.client.get('accounts/me')
    expect(result._id)
      .toBe(account._id)
  })

  it('can add roles by id', async() => {
    const developerAccount = await factory.new.account
            .addRole('000000000000000000000007')
            .build(),
          result = await developerAccount.read()

    expect(result.roles.length)
      .toBe(1)
    expect(result.roles)
      .toContain('000000000000000000000007')
  })

  it('can add roles by name', async() => {
    const developerAccount = await factory.new.account
            .addRole('Developer')
            .build(),
          result = await developerAccount.read()

    expect(result.roles.length)
      .toBe(1)
    expect(result.roles)
      .toContain('000000000000000000000007')
  })

  it('can add roles by code', async() => {

    const developerAccount = await factory.new.account
            .addRole('developer')
            .build(),
          result = await developerAccount.read()

    expect(result.roles.length)
      .toBe(1)
    expect(result.roles)
      .toContain('000000000000000000000007')
  })

  it('throws errors for unknown role', async() => {
    expect.assertions(1)
    try {
      const badRole = await factory.new.account
        .addRole('unknown role xyz111')
        .build()
    } catch (e) {
      expect(e.message)
        .toBe('Could not find role with matching _id, name, or code: unknown role xyz111')
    }
  })
})
