// Public Firebase web config. These are NOT secrets — anyone who opens the page
// can read them. What protects the data is database.rules.json, not this file.
export const FIREBASE = {
  apiKey: "AIzaSyCXAvUjNipQ3zLIBAM61xElcEa0T4FQCGo",
  authDomain: "owngoal-b201f.firebaseapp.com",
  projectId: "owngoal-b201f",
  storageBucket: "owngoal-b201f.firebasestorage.app",
  messagingSenderId: "974490595317",
  appId: "1:974490595317:web:88e79f1d418b557131fabc",

  // ⚠️ CHANGE THIS ONE LINE if your database lives outside the US.
  // The correct value is printed above the data tree in the Firebase console.
  //   US       → https://owngoal-b201f-default-rtdb.firebaseio.com
  //   Europe   → https://owngoal-b201f-default-rtdb.europe-west1.firebasedatabase.app
  //   Asia     → https://owngoal-b201f-default-rtdb.asia-southeast1.firebasedatabase.app
  databaseURL: "https://owngoal-b201f-default-rtdb.firebaseio.com",
};

export const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
