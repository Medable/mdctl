import FactoryBuilder from './factory-builder'
import ObjectBuilder from './object-builder'
import Factory from './factory'

describe('FactoryBuilder', () => {
  let client,
      factoryBuilder

  beforeEach(() => {
    client = {
      post: jest.fn()
        .mockResolvedValue(),
      delete: jest.fn()
        .mockResolvedValue()
    }
    factoryBuilder = new FactoryBuilder(client)
  })

  it('builds factories', () => {
    const factory = factoryBuilder.build()
    expect(factory)
      .toBeInstanceOf(Factory)
  })

  it('supports registering and retrieving builders', async() => {
    class CustomType extends ObjectBuilder {

      static _type() {
        return 'c_custom_type'
      }

    }

    factoryBuilder.register(CustomType)

    const factory = factoryBuilder.build()

    const builder = factory.new.c_custom_type
    expect(builder)
      .toBeInstanceOf(CustomType)
  })

  describe('builders', () => {

    it('can create objects', async() => {
      class CustomType extends ObjectBuilder {

        static _type() {
          return 'c_custom_type'
        }

      }

      factoryBuilder.register(CustomType)

      const factory = factoryBuilder.build()

      const builder = factory.new.c_custom_type
      expect(builder._id)
        .toBeUndefined()

      client.post.mockResolvedValue({ data: { _id: '1-create-object' } })
      const object = await builder.build()

      expect(client.post)
        .toHaveBeenCalledWith('c_custom_type', {})
      expect(object._id)
        .toBe('1-create-object')
    })

    it('can set and unset properties', async() => {
      class CustomType extends ObjectBuilder {

        static _type() {
          return 'c_custom_type'
        }

      }

      factoryBuilder.register(CustomType)

      const factory = factoryBuilder.build()

      const builder = factory.new.c_custom_type
      expect(builder._id)
        .toBeUndefined()

      client.post.mockResolvedValue({ data: { _id: '2-set-props' } })
      const object = await builder
        .set('someProperty', 'someValue')
        .set('anotherProperty', 'anotherValue')
        .unset('anotherProperty')
        .build()

      expect(client.post)
        .toHaveBeenCalledWith('c_custom_type', {
          someProperty: 'someValue'
        })

      expect(object._id)
        .toBe('2-set-props')
    })

    it('can specify defaults', async() => {
      class CustomType extends ObjectBuilder {

        static _type() {
          return 'c_custom_type'
        }
        static defaults() {
          return {
            defaultProperty: 'defaultValue',
            anotherDefaultProperty: 'anotherDefaultValue'
          }
        }

      }

      factoryBuilder.register(CustomType)

      const factory = factoryBuilder.build()

      const builder = factory.new.c_custom_type
      expect(builder._id)
        .toBeUndefined()

      client.post.mockResolvedValue({ data: { _id: '3-use-defaults' } })
      const object = await builder
        .set('someProperty', 'someValue')
        .set('anotherDefaultProperty', 'overriddenValue')
        .build()

      expect(client.post)
        .toHaveBeenCalledWith('c_custom_type', {
          defaultProperty: 'defaultValue',
          anotherDefaultProperty: 'overriddenValue',
          someProperty: 'someValue'
        })

      expect(object._id)
        .toBe('3-use-defaults')
    })
  })

  it('can clean up created objects', async() => {
    class CustomType extends ObjectBuilder {

      static _type() {
        return 'c_custom_type'
      }

    }

    factoryBuilder.register(CustomType)
    const factory = factoryBuilder.build()

    client.post.mockResolvedValue({ data: { _id: '1' } })
    await factory.new.c_custom_type.build()
    client.post.mockResolvedValue({ data: { _id: '2' } })
    await factory.new.c_custom_type.build()
    client.post.mockResolvedValue({ data: { _id: '3' } })
    await factory.new.c_custom_type.build()

    expect(client.post.mock.calls.length)
      .toBe(3)
    expect(client.delete.mock.calls.length)
      .toBe(0)

    await factory.clean()
    expect(client.delete.mock.calls.length)
      .toBe(3)
    expect(client.delete)
      .toHaveBeenCalledWith('c_custom_type/1')
    expect(client.delete)
      .toHaveBeenCalledWith('c_custom_type/2')
    expect(client.delete)
      .toHaveBeenCalledWith('c_custom_type/3')

  })
})