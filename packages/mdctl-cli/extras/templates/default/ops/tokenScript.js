const token = org.objects.account.createAuthToken('%KEY%', 'fiachra@medable.com', { scope: '*', permanent: true, includeEmail: true })
return { token }
