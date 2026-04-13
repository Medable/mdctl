/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import {
  as,
  log,
  route,

} from 'decorators';

const sensitiveKeys = [
  'Token',
  'client_id',
  'client_secret',
  'Authorization',
  'access_token',
  'UserName',
  'Ocp-Apim-Subscription-Key',
  'username',
  'password',
];

class Logs {

  /** Fetches all log records in descending order associated with the outbound calls */

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/logs:
   *   get:
   *     summary: Fetch Logs Associated with the outbound queues
   *     description: Fetch Logs Associated with the outbound queues
   *     tags:
   *       - Queue
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *          type: integer
   *          description: The number of items that should be returned in the response. Deafult is 10
   *       - in: query
   *         name: pageNumber
   *         schema:
   *          type: integer
   *          description: Current page number, default is 1
   *       - in: query
   *         name: search
   *         schema:
   *          type: ObjectId
   *          description: Participant or Queue ID for filtering the logs
   *       - in: query
   *         name: sort
   *         schema:
   *          type: Number
   *          description: 1/-1 for sorting queue based on created date
   *     requestBody:
   *       required: false
   *     responses:
   *       200:
   *         description: OK
   *       403:
   *         description: Forbidden
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('GET /int/v1/logs', {
    acl: 'role.administrator',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static fetchLogs({ req }) {
    const { pageNumber = 1, limit = 10, sort = -1, search } = req.query;

    const offset = (+pageNumber - 1) * +limit;

    let query;
    if (search) {
      query = {
        $or: [
          { _id: search },
          { int__sequence: search },
        ],
      };
    }

    const totalRecords = org.objects.int__queue.count(query);

    const data = org.objects.int__queue.find(query)
      .sort({ created: +sort })
      .limit(limit)
      .skip(offset)
      .expand('int__pipeline')
      .paths('int__status', 'int__sequence', 'int__pipeline.int__identifier', 'created')
      .map((queueObj) => {
        return {
          queueId: queueObj._id,
          pipeline: queueObj.int__pipeline.int__identifier,
          participantId: queueObj.int__sequence,
          status: queueObj.int__status,
          created: queueObj.created,
          logs: org.objects.int__log.find({ int__queue: queueObj._id })
            .sort({ created: 1 })
            .expand('int__task')
            .paths('int__status', 'int__request', 'int__response', 'int__task.int__action')
            .filter(logObj => logObj.int__task.int__action !== 'int__expression_task')
            .map(logObj => {

              Logs.maskSensitiveValues(logObj);
              return {
                request: logObj.int__request,
                response: logObj.int__response,
                status: logObj.int__status,
              };

            }),
        };
      });

    return {
      data,
      totalRecords,
      limit,
      pageNumber,
      currentPageRecords: data.length,
      totalPages: Math.ceil(totalRecords / limit),
      hasMore: totalRecords > +limit + offset,
    };
  }

  static maskSensitiveValues(obj) {
    Object.keys(obj)
      .forEach(function(k) {
        if (obj[k] !== null && typeof obj[k] === 'object') {
          Logs.maskSensitiveValues(obj[k]);
          return;
        }
        if (sensitiveKeys.indexOf(k) > -1) {
          obj[k] = 'XXXXXX';
        }
      });

  }

}

module.exports = Logs;