const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function seedUsers() {
  const usersRef = db.collection('users');

  const rawData = [
    {
      fullName: "Harry P.",
      fullNameLower: "harry p.",
      scoutingId: "200001",
      email: "chosenone@hogwarts.edu",
      emailLower: "chosenone@hogwarts.edu",
      currentPoints: 141,
      worthPoints: 50,
      pointValueComment: "The chosen one",
      numUsersMet: 4,
      usersMet: ["Tom R.", "Albus D.", "Ron W.", "Hermione G."]
    },
    {
      fullName: "Tom R.",
      fullNameLower: "tom r.",
      scoutingId: "200002",
      email: "lordvoldemort@deatheaters.inc",
      emailLower: "lordvoldemort@deatheaters.inc",
      currentPoints: 140,
      worthPoints: 1,
      pointValueComment: "Couldn't even defeat a high school",
      numUsersMet: 3,
      usersMet: ["Albus D.", "Ron W.", "Hermione G."]
    },
    {
      fullName: "Albus D.",
      fullNameLower: "albus d.",
      scoutingId: "200003",
      email: "headmaster@hogwarts.edu",
      emailLower: "headmaster@hogwarts.edu",
      currentPoints: 40,
      worthPoints: 100,
      pointValueComment: "",
      numUsersMet: 2,
      usersMet: ["Ron W.", "Hermione G."]
    },
    {
      fullName: "Ron W.",
      fullNameLower: "ron w.",
      scoutingId: "200004",
      email: "redhead@hogwarts.edu",
      emailLower: "redhead@hogwarts.edu",
      currentPoints: 20,
      worthPoints: 20,
      pointValueComment: "",
      numUsersMet: 1,
      usersMet: ["Hermione G."]
    },
    {
      fullName: "Hermione G.",
      fullNameLower: "hermione g.",
      scoutingId: "200005",
      email: "thesmartone@hogwarts.edu",
      emailLower: "thesmartone@hogwarts.edu",
      currentPoints: 0,
      worthPoints: 20,
      pointValueComment: "",
      numUsersMet: 0,
      usersMet: []
    }
  ];

  // Pre-generate document references to obtain the dynamic docids
  const usersWithRefs = rawData.map(user => {
    const docRef = usersRef.doc();
    return { ...user, docRef, docid: docRef.id };
  });

  // Create a lookup map of fullName -> docid and fullName -> worthPoints
  const nameToIdMap = {};
  const nameToWorthPointsMap = {};
  usersWithRefs.forEach(user => {
    nameToIdMap[user.fullName] = user.docid;
    nameToWorthPointsMap[user.fullName] = user.worthPoints;
  });

  // Prepare the batch write
  const batch = db.batch();

  usersWithRefs.forEach(user => {
    // Dynamically map the usersMet names to their generated docids and worthPoints
    const usersMetId = user.usersMet.map(name => nameToIdMap[name]);
    const usersMetPoints = user.usersMet.map(name => nameToWorthPointsMap[name]);

    const firestoreData = {
      fullName: user.fullName,
      fullNameLower: user.fullNameLower,
      scoutingId: user.scoutingId,
      email: user.email,
      emailLower: user.emailLower,
      currentPoints: user.currentPoints,
      worthPoints: user.worthPoints,
      pointValueComment: user.pointValueComment,
      numUsersMet: user.numUsersMet,
      usersMet: user.usersMet,
      usersMetId: usersMetId,
      usersMetPoints: usersMetPoints, // Added this array
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Add the set operation to the batch
    batch.set(user.docRef, firestoreData);
  });

  // Commit the batch to Firestore
  try {
    await batch.commit();
    console.log("Successfully seeded users to Firestore.");
  } catch (error) {
    console.error("Error writing to Firestore: ", error);
  }
}

seedUsers();
