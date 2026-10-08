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
      const usersMet = userData.usersMet || [];
      const usersMetId = userData.usersMetId || [];
      const usersMetPoints = userData.usersMetPoints || [];

      switch (editType) {
        case 'delete': {
          const { id, points } = editData;
          const userIndex = usersMetId.indexOf(id);

          if (userIndex > -1) {
            // Remove the user from all three arrays at the specific index
            usersMetId.splice(userIndex, 1);
            usersMet.splice(userIndex, 1);
            usersMetPoints.splice(userIndex, 1);

            updates.usersMetId = usersMetId;
            updates.usersMet = usersMet;
            updates.usersMetPoints = usersMetPoints;

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
          let pointDifference = 0;
          let userIndices = [];

          // Find all occurrences of the user ID
          usersMetId.forEach((uid, index) => {
            if (uid === id) {
              userIndices.push(index);
            }
          });

          if (userIndices.length > 0) {
            userIndices.forEach((index) => {
              // Update the points in the usersMetPoints array
              usersMetPoints[index] = Number(newPoints);
              pointDifference += Number(newPoints) - Number(oldPoints);
            });

            updates.usersMetPoints = usersMetPoints;
            updates.currentPoints = currentPoints + pointDifference;
            needsUpdate = true;
          }
          break;
        }
        case 'nameAndWorthPoints': {
          const { id, oldName, newName, oldPoints, newPoints } = editData;
          let pointDifference = 0;
          let userIndices = [];

          // Find all occurrences of the user ID to update name and points
          usersMetId.forEach((uid, index) => {
            if (uid === id) {
              userIndices.push(index);
            }
          });

          if (userIndices.length > 0) {
            userIndices.forEach((index) => {
              // Update name
              if (usersMet[index] === oldName) {
                usersMet[index] = newName;
              }
              // Update points
              usersMetPoints[index] = Number(newPoints);
              pointDifference += Number(newPoints) - Number(oldPoints);
            });

            updates.usersMet = usersMet;
            updates.usersMetPoints = usersMetPoints;
            updates.currentPoints = currentPoints + pointDifference;
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

/**
 * Export Game Data
 * Fetches all users and returns them as a JSON object.
 */
exports.exportGameData = functions.https.onCall(async (data, context) => {
  // Optional: Add admin auth check here
  // if (!context.auth || context.auth.token.admin !== true) {
  //     throw new functions.https.HttpsError("permission-denied", "Only admins can export data.");
  // }

  const db = admin.firestore();
  const exportData = { users: {} };

  try {
    const usersSnapshot = await db.collection('users').get();
    usersSnapshot.forEach((doc) => {
      exportData.users[doc.id] = doc.data();
    });

    return exportData;
  } catch (error) {
    throw new functions.https.HttpsError(
      'internal',
      'Failed to export data.',
      error,
    );
  }
});

/**
 * Import Game Data
 * Receives a JSON object and safely batch-writes it to the database.
 */
exports.importGameData = functions.https.onCall(async (data, context) => {
    // 1. Handle differences between Firebase v1/v2 and extra data wrappers
    const payload = data.data || data;

    // 2. Hunt for the 'users' object regardless of how the JSON is wrapped
    let users = null;
    if (payload.users) {
        users = payload.users;
    } else if (payload.gameData && payload.gameData.users) {
        users = payload.gameData.users;
    } else if (payload.data && payload.data.users) {
        users = payload.data.users;
    }

    // 3. Reject if we still can't find valid user data
    if (!users || typeof users !== 'object') {
        throw new functions.https.HttpsError(
            "invalid-argument", 
            "Invalid format: Could not locate the 'users' object in the file."
        );
    }

    const db = admin.firestore();
    try {
        let batch = db.batch();
        let operationCount = 0;

        for (const [docId, userData] of Object.entries(users)) {
            const docRef = db.collection("users").doc(docId);
            batch.set(docRef, userData);
            operationCount++;

            if (operationCount === 500) {
                await batch.commit();
                batch = db.batch();
                operationCount = 0;
            }
        }

        if (operationCount > 0) {
            await batch.commit();
        }

        return { message: "Import successful" };
    } catch (error) {
        throw new functions.https.HttpsError("internal", "Failed to write data.", error);
    }
});

/**
 * Wipe Game Data
 * Deletes all documents in the 'users' collection.
 */
exports.wipeGameData = functions.https.onCall(async (data, context) => {
  // Optional: Add admin auth check here

  const db = admin.firestore();

  try {
    const usersSnapshot = await db.collection('users').get();

    let batch = db.batch();
    let operationCount = 0;

    for (const doc of usersSnapshot.docs) {
      batch.delete(doc.ref);
      operationCount++;

      // Chunk deletions to bypass the 500 operation batch limit
      if (operationCount === 500) {
        await batch.commit();
        batch = db.batch();
        operationCount = 0;
      }
    }

    // Commit remaining deletions
    if (operationCount > 0) {
      await batch.commit();
    }

    return { message: 'Database wiped successfully' };
  } catch (error) {
    throw new functions.https.HttpsError(
      'internal',
      'Failed to wipe data.',
      error,
    );
  }
});
