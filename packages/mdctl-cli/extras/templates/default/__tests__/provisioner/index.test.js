import Provisioner from './index'
import _ from 'lodash'

test('test provisioner', async(done) => {
  const generator = () => {
          const step1 = function(data) {
                  return _.extend(data, { step1: 'ok' })
                },
                step2 = function(data) {
                  // extend previous result with new data
                  return _.extend(data, { step2: 'ok' })
                },
                step3 = function(data) {
                  // take decisions based on previous stages
                  // also don't need to return extended data _.extend(data, {...}) this will be taken care by the provisioner
                  return data.step1 === 'ok' ? { step3: 'nok' } : { step3: 'ok' }
                },
                step4 = function(data) {

                }

          return [step1, step2, step4, step3]
        },
        provisioner = Provisioner({ login: () => Promise.resolve() }),
        data = await provisioner.run(generator)

  expect(data).toMatchObject({ step1: 'ok', step2: 'ok', step3: 'nok' })
  done()
})
