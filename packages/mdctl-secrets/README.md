# mdctl-secrets

Developer Tools Secrets Module for Medable 

This module exposes the different kind of secrets you can use as credentials

*Note: All secrets needs an environment definition.*

- Password Secret
  * It uses username, password and apiKey
- Signature Secret
  * It uses secret and apiKey 
- Token Secret
  * It uses a JWT token
  
## Usage

```
  new PasswordSecret(environment, {username: 'test', password: 'test', apiKey: 'myawesomeapikey'})
  
  new SignatureSecret(environment, {signature: 'myawesomesignature', apiKey: 'myawesomeapikey'})
  
  new TokenSecret(environment, {token: 'jwttokendata'})
  
```
