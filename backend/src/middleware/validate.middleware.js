const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

const validateParams = (schema) => (req, res, next) => {
  try {
    req.params = schema.parse(req.params);
    next();
  } catch (error) {
    next(error);
  }
};

const validateQuery = (schema) => (req, res, next) => {
  try {
    // Express 5 makes req.query read-only; store the parsed+coerced
    // result on req.parsedQuery so controllers can access typed values.
    req.parsedQuery = schema.parse(req.query);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { validate, validateParams, validateQuery };
