const { dt__export } = org.objects

class DtExportRepository {

  static types = {
    LONG: 'long',
    WIDE: 'wide'
  }

  static tz = {
    UTC: 'UTC',
    PATIENT: 'PATIENT'
  }

  static findActiveByConfigId(configId) {
    return dt__export
      .find({
        dt__config: configId,
        dt__active: true
      })
      .toArray()
  }

}

module.exports = DtExportRepository