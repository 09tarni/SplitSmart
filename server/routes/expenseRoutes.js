const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  addExpense,
  getGroupExpenses,
  getGroupBalances,
  getSimplifiedDebts,
  settleUp,
} = require('../controllers/expenseController');

router.post('/groups/:groupId/expenses', protect, addExpense);
router.get('/groups/:groupId/expenses', protect, getGroupExpenses);
router.get('/groups/:groupId/balances', protect, getGroupBalances);
router.get('/groups/:groupId/simplify', protect, getSimplifiedDebts);
router.post('/groups/:groupId/settle', protect, settleUp);

module.exports = router;