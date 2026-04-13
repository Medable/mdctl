const { account } = org.objects

class AccountRepository {

  static getById(accountId) {
    return account
      .find({ _id: accountId })
      .next()
  }

}

module.exports = AccountRepository