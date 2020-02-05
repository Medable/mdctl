const MODULE = Object.freeze({
  name: 'Documented Module',
  gitbookDescription: 'This is a documented module',
  description: '```javascript\nconst module = require(\'module\')\n```',
  routes: [
    {
      method: 'post',
      path: '/resources/:resource_id',
      description: 'Creates a resource',
      tabs: [
        {
          title: 'mdctl-cli',
          body: '```bash\nmd\n```'
        },
        {
          title: 'javascript',
          body: '```javascript\nmodule.run()\n```'
        },
      ],
      params: {
        path: [
          {
            name: 'resource_id',
            typeString: 'string',
            description: 'Resource ID'
          }
        ],
        body: [
          {
            name: 'resource',
            typeString: 'Object',
            description: 'Resource object',
            children: [
              {
                name: 'name',
                typeString: 'string',
                description: 'Resource name'
              }
            ]
          }
        ],
        query: [
          {
            name: 'token',
            typeString: 'string',
            description: 'User token (JWT)'
          }
        ],
        header: [
          {
            name: 'Content-Type',
            typeString: 'string',
            description: 'Request content type'
          }
        ],
        response: [
          {
            name: 'resource',
            typeString: 'Object',
            description: 'Created resource object',
            children: [
              {
                name: 'name',
                typeString: 'string',
                description: 'Resource name'
              }
            ]
          }
        ]
      }
    }
  ],
  objects: [
    {
      type: 'class',
      name: 'Documented',
      description: 'Documented class',
      functions: [
        {
          name: 'returnObject',
          paramString: 'param1, param2',
          description: 'returns an object containing both parameters',
          params: [
            {
              name: 'param1',
              typeString: 'string',
              default: '1',
              description: 'The first parameter'
            },
            {
              name: 'param2',
              typeString: 'number',
              default: '2',
              description: 'The second parameter'
            }
          ],
          returns: [
            {
              name: '',
              typeString: 'Object',
              default: '',
              description: 'An object consisting of both parameters'
            }
          ]
        }
      ]
    }
  ],
  examples: [
    {
      name: 'Basic useage',
      body: '```javascript\nmodule.run()\n```'
    },
    {
      name: 'Advanced useage',
      body: '```javascript\nmodule.run(options)\n```'
    }
  ]
})

module.exports = {
  MODULE,
}