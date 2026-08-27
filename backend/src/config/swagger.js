const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',

    info: {
      title: 'WorkFlow API',
      version: '1.0.0',
      description: 'Project management and issue-tracking platform API',
    },

    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local development',
      },
    ],

    tags: [
      {
        name: 'Auth',
        description: 'Authentication and user profile',
      },
      {
        name: 'Projects',
        description: 'Project management and membership',
      },
      {
        name: 'Issues',
        description: 'Issue and task management',
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },

      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
            },
          },
        },

        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
  },

  apis: [
    path.resolve(__dirname, '../routes/auth.routes.js'),
    path.resolve(__dirname, '../routes/project.routes.js'),
    path.resolve(__dirname, '../routes/issue.routes.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;