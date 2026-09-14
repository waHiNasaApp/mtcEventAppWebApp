// Set maximum number of containers
const { setGlobalOptions } = require('firebase-functions');
setGlobalOptions({
  maxInstances: 3,
});

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.getLeaderboards = functions.https.onCall(async (data, context) => {
  const n = parseInt(data.n, 10) || 10;

  if (n <= 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The "n" parameter must be a valid positive integer.',
    );
  }

  const db = admin.firestore();

  // Helper function to replace NaN with 0 in the data
  const sanitizeData = (data) => {
    for (const key in data) {
      if (Number.isNaN(data[key])) {
        data[key] = 0;
      }
    }

    data.currentPoints = data.currentPoints ?? 0;
    data.numUsersMet = data.numUsersMet ?? 0;

    return data;
  };

  try {
    const pointsSnapshot = await db
      .collection('users')
      .orderBy('currentPoints', 'desc')
      .limit(n)
      .get();

    const topByPoints = pointsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...sanitizeData(doc.data()),
    }));

    const usersMetSnapshot = await db
      .collection('users')
      .orderBy('numUsersMet', 'desc')
      .limit(n)
      .get();

    const topByUsersMet = usersMetSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...sanitizeData(doc.data()),
    }));

    return {
      topByPoints: topByPoints,
      topByUsersMet: topByUsersMet,
    };
  } catch (error) {
    console.error('Error fetching leaderboards: ', error);
    throw new functions.https.HttpsError(
      'internal',
      'Unable to fetch leaderboards',
    );
  }
});
