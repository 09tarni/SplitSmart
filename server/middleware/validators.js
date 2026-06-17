const { body, param, query, validationResult } = require('express-validator');

// Middleware to check validation results
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg, // return first error only
      errors: errors.array(),
    });
  }
  next();
};

// Auth validators
const registerValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .isLength({ max: 100 }).withMessage('Password too long'),
  validate,
];

const loginValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
  validate,
];

// Group validators
const createGroupValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Group name is required')
    .isLength({ min: 1, max: 100 }).withMessage('Group name must be 1–100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
  validate,
];

const addMemberValidator = [
  body('user_id')
    .notEmpty().withMessage('user_id is required')
    .isInt({ min: 1 }).withMessage('user_id must be a positive integer'),
  validate,
];

// Expense validators
const addExpenseValidator = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 1, max: 200 }).withMessage('Title must be 1–200 characters'),
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01, max: 1000000 }).withMessage('Amount must be between ₹0.01 and ₹10,00,000'),
  body('split_type')
    .notEmpty().withMessage('split_type is required')
    .isIn(['equal', 'percentage', 'exact']).withMessage("split_type must be 'equal', 'percentage', or 'exact'"),
  body('category')
    .optional()
    .isIn(['general', 'food', 'travel', 'shopping', 'utilities'])
    .withMessage('Invalid category'),
  body('date')
    .optional()
    .isDate().withMessage('date must be a valid date (YYYY-MM-DD)'),
  body('paid_by')
    .optional()
    .isInt({ min: 1 }).withMessage('paid_by must be a positive integer'),
  body('splits')
    .optional()
    .isArray().withMessage('splits must be an array'),
  body('splits.*.user_id')
    .optional()
    .isInt({ min: 1 }).withMessage('Each split user_id must be a positive integer'),
  body('splits.*.owed_amount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Each split owed_amount must be non-negative'),
  validate,
];

// Settlement validator
const settleValidator = [
  body('from_user_id')
    .notEmpty().withMessage('from_user_id is required')
    .isInt({ min: 1 }).withMessage('from_user_id must be a positive integer'),
  body('to_user_id')
    .notEmpty().withMessage('to_user_id is required')
    .isInt({ min: 1 }).withMessage('to_user_id must be a positive integer'),
  body('amount')
    .notEmpty().withMessage('amount is required')
    .isFloat({ min: 0.01 }).withMessage('amount must be greater than 0'),
  validate,
];

// Recurring expense validator
const recurringValidator = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 1, max: 200 }).withMessage('Title must be 1–200 characters'),
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01, max: 1000000 }).withMessage('Amount must be between ₹0.01 and ₹10,00,000'),
  body('frequency')
    .notEmpty().withMessage('frequency is required')
    .isIn(['daily', 'weekly', 'monthly']).withMessage("frequency must be 'daily', 'weekly', or 'monthly'"),
  body('next_due')
    .notEmpty().withMessage('next_due is required')
    .isDate().withMessage('next_due must be a valid date (YYYY-MM-DD)'),
  body('category')
    .optional()
    .isIn(['general', 'food', 'travel', 'shopping', 'utilities'])
    .withMessage('Invalid category'),
  validate,
];

module.exports = {
  registerValidator,
  loginValidator,
  createGroupValidator,
  addMemberValidator,
  addExpenseValidator,
  settleValidator,
  recurringValidator,
};