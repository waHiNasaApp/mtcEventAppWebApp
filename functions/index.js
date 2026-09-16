// Set maximum number of containers
const { setGlobalOptions } = require('firebase-functions');
setGlobalOptions({
  maxInstances: 3,
});

const { onCall, HttpsError } = require('firebase-functions/v2/https');

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

  // Helper function to replace NaN and Undefined with 0 in the data
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

exports.propogateEdit = onCall(async (request) => {
  const db = admin.firestore();

  console.log('Raw payload received:', JSON.stringify(request.data));

  const { editType, editData } = request.data;

  const validTypes = ['delete', 'name', 'worthPoints', 'nameAndWorthPoints'];
  if (!validTypes.includes(editType)) {
    throw new HttpsError('invalid-argument', 'Invalid editType provided.');
  }

  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();

    let batch = db.batch();
    let batchCount = 0;
    let totalUpdated = 0;

    for (const doc of snapshot.docs) {
      if (doc.id === editData.id) continue;

      const userData = doc.data();
      let needsUpdate = false;
      let updates = {};

      const currentPoints = Number(userData.currentPoints) || 0;
      const numUsersMet = Number(userData.numUsersMet) || 0;

      switch (editType) {
        case 'delete': {
          const { id, name, points } = editData;
          if (usersMetId.includes(id) || usersMet.includes(name)) {
            updates.usersMetId = usersMetId.filter((uid) => uid !== id);
            updates.usersMet = usersMet.filter((n) => n !== name);
            updates.currentPoints = currentPoints - Number(points);
            updates.numUsersMet = Math.max(0, numUsersMet - 1);
            needsUpdate = true;
          }
          break;
        }
        case 'name': {
          const { oldName, newName } = editData;
          if (usersMet.includes(oldName)) {
            updates.usersMet = usersMet.map((n) =>
              n === oldName ? newName : n,
            );
            needsUpdate = true;
          }
          break;
        }
        case 'worthPoints': {
          const { id, oldPoints, newPoints } = editData;
          if (usersMetId.includes(id)) {
            updates.currentPoints =
              currentPoints + (Number(newPoints) - Number(oldPoints));
            needsUpdate = true;
          }
          break;
        }
        case 'nameAndWorthPoints': {
          const { id, oldName, newName, oldPoints, newPoints } = editData;

          if (usersMet.includes(oldName)) {
            updates.usersMet = usersMet.map((n) =>
              n === oldName ? newName : n,
            );
            needsUpdate = true;
          }
          if (usersMetId.includes(id)) {
            updates.currentPoints =
              currentPoints + (Number(newPoints) - Number(oldPoints));
            needsUpdate = true;
          }
          break;
        }
      }

      if (needsUpdate) {
        batch.update(doc.ref, updates);
        batchCount++;
        totalUpdated++;

        if (batchCount === 500) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`Success! Updated ${totalUpdated} users.`);
    return {
      success: true,
      message: `Successfully applied ${editType} to ${totalUpdated} users.`,
    };
  } catch (error) {
    console.error('CRITICAL FUNCTION ERROR:', error);
    throw new HttpsError(
      'internal',
      'An error occurred while updating the database.',
      error.message,
    );
  }
});
