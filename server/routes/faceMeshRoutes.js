const express = require('express');
const router = express.Router();
const { logFaceMeshEvent } = require('../controllers/faceMeshController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logFaceMeshEvent);

module.exports = router;
