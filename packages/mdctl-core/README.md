# mdctl-core :: Core Module

Developer Tools core module

This module provides the core structure to work with Medable Developer Tools

- Fault: Common interface for error handling
- Manifest: Class to manage import/export manifest object, this will allow to set regular expression to match object paths in order to decide what to export/import.
- Config: Common interface for manage configurations.
- Section: Common interface for handling import/export sections.
- Output/Input Stream: common interface to i/o ndjson data.
- CredentialsProvider: common interface for credential providers.
- Secrets: common interface to handling secret types, e.g Signature, User/Password, JWT.
