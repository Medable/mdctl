class IntFaults {

  static throwError(faultCode, transactionId) {
    try {
      throw Error(faultCode);
    } catch (err) {
      const ResponseData = {
        Success: false,
        Message: '',
        ResponseCode: '',
      };

      const errObject = org.objects.int__fault.readOne({ int__error_code: faultCode })
        .paths(['int__message', 'int__status_code'])
        .throwNotFound(false)
        .skipAcl()
        .grant('read')
        .execute();

      if (transactionId) { ResponseData.TransactionID = transactionId; };

      ResponseData.Message = errObject.int__message;
      ResponseData.ResponseCode = errObject.int__status_code;
      return {
        error: true,
        result: { ResponseData },
      };
    }

  }

}

module.exports = IntFaults;