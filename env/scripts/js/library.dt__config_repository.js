const { dt__config } = org.objects

class DtConfigRepository {

  static statuses = {
    COMPLETED: 'COMPLETED',
    ERROR: 'ERROR',
    RUNNING: 'RUNNING',
    SCHEDULED_TRANSFER: 'SCHEDULED_TRANSFER',
    READY_TO_TRANSFER: 'READY_TO_TRANSFER',
    CANCELLED: 'CANCELLED'
  }

  static delimiters = {
    COMMA: 'comma',
    SEMICOLON: 'semicolon',
    PIPE: 'pipe'
  }

  static findByKey(key) {
    return dt__config
      .find({ dt__key: key })
      .toArray()
  }

  static findById(id) {
    return dt__config
      .find({ _id: id })
      .toArray()
  }

  static getById(id) {
    return dt__config
      .find({ _id: id })
      .next()
  }

  static updateById(id, params) {
    return dt__config
      .updateOne({ _id: id }, { $set: params })
      .execute()
  }

}

module.exports = DtConfigRepository