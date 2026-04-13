const { dt__execution } = org.objects

class DtExecutionRepository {

  static statuses = {
    ERROR: 'ERROR',
    SUCCESS: 'SUCCESS'
  }

  static create(params) {
    return dt__execution
      .insertOne({
        dt__started: new Date(),
        ...(params.dt__error && {
          dt__ended: new Date(),
          dt__status: this.statuses.ERROR
        }),
        ...params
      })
      .lean(false)
      .execute()
  }

  static updateByDagRunId(dagRunId, params) {
    return dt__execution
      .updateOne({ dt__dag_run_id: dagRunId }, { $set: params })
      .execute()
  }

  static findById(id) {
    return dt__execution
      .find({ _id: id })
      .toArray()
  }

}

module.exports = DtExecutionRepository