const express = require('express');
const { createGroup, getMyGroups, getGroupById, addMember, updateGroup, leaveGroup, deleteGroup } = require('../controllers/groupController');
const {
  addExpense, getGroupExpenses, getGroupBalances,
  getSimplifiedDebts, settleUp, getSettlements, getGroupAnalytics,
} = require('../controllers/expenseController');
const { createRecurring, getRecurring, deleteRecurring } = require('../controllers/recurringController');
const { generateReport } = require('../controllers/reportController');
const { getGroupActivity } = require('../controllers/activityController');
const { getAIInsights } = require('../controllers/insightsController');
const { protect } = require('../middleware/authMiddleware');
const {
  createGroupValidator, addMemberValidator,
  addExpenseValidator, settleValidator, recurringValidator,
} = require('../middleware/validators');

const router = express.Router();
router.use(protect);

router.post('/', createGroupValidator, createGroup);
router.get('/', getMyGroups);

router.post('/:groupId/expenses', addExpenseValidator, addExpense);
router.get('/:groupId/expenses', getGroupExpenses);
router.get('/:groupId/balances', getGroupBalances);
router.get('/:groupId/simplify', getSimplifiedDebts);
router.post('/:groupId/settle', settleValidator, settleUp);
router.get('/:groupId/settlements', getSettlements);
router.get('/:groupId/analytics', getGroupAnalytics);
router.get('/:groupId/report', generateReport);
router.get('/:groupId/activity', getGroupActivity);
router.get('/:groupId/insights', getAIInsights);

router.post('/:groupId/recurring', recurringValidator, createRecurring);
router.get('/:groupId/recurring', getRecurring);
router.delete('/:groupId/recurring/:recurringId', deleteRecurring);

router.get('/:id', getGroupById);
router.post('/:id/members', addMemberValidator, addMember);
router.patch('/:id', updateGroup);
router.post('/:id/leave', leaveGroup);
router.delete('/:id', deleteGroup);

module.exports = router;