const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())
const dbpath = path.join(__dirname, 'twitterClone.db')
let db = null
const intializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
intializeDBandServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const queryOne = `SELECT * FROM user WHERE username = '${username}' `
  const dbUser = await db.get(queryOne)
  let api1
  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashPassword = await bcrypt.hash(password, 10)
      api1 = `
  INSERT INTO user (username, password, name, gender)
  VALUES (
    '${username}',
    '${hashPassword}',
    '${name}',
    '${gender}'
  )`
      const dbOne = await db.run(api1)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authenticHeader = request.headers['authorization']
  if (authenticHeader !== undefined) {
    jwtToken = authenticHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'mySecretCode', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const queryTwo = `SELECT * FROM user WHERE username = '${username}' `
  const dbUserTwo = await db.get(queryTwo)
  const payload = {
    username: username,
  }
  const jwtToken = jwt.sign(payload, 'mySecretCode')
  if (dbUserTwo === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUserTwo.password)
    if (isPasswordMatched === true) {
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getQueryThree = `SELECT * FROM user WHERE username = '${username}' `
  const dbUser = await db.get(getQueryThree)
  const userId = dbUser['user_id']

  const api3 = `
SELECT user.username,
tweet.tweet,
tweet.date_time AS dateTime
FROM tweet
INNER JOIN user ON tweet.user_id = user.user_id
WHERE user.user_id IN (
  SELECT following_user_id 
  FROM follower 
  WHERE follower_user_id = ${userId}
)
ORDER BY tweet.date_time DESC
LIMIT 4`

  const data = await db.all(api3)
  response.send(data)
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getQueryThree = `SELECT * FROM user WHERE username = '${username}' `
  const dbUser = await db.get(getQueryThree)
  const userId = dbUser['user_id']

  const api4 = `
SELECT DISTINCT name 
FROM user 
INNER JOIN follower ON user.user_id = follower.following_user_id
WHERE follower.follower_user_id = ${userId}
`

  const finalTwo = await db.all(api4)
  response.send(finalTwo)
})

module.exports = app

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getQueryFour = `SELECT * FROM user WHERE username = '${username}' `
  const dbUser = await db.get(getQueryFour)
  const userId = dbUser['user_id']

  const api5 = `
SELECT DISTINCT name 
FROM user 
INNER JOIN follower ON user.user_id = follower.follower_user_id
WHERE follower.following_user_id = ${userId}
`

  const finalThree = await db.all(api5)
  response.send(finalThree)
})

const tweetAccessVerification = async (request, response, next) => {
  const userQuery = `SELECT user_id FROM user WHERE username = '${request.username}'`
  const user = await db.get(userQuery)
  const userId = user.user_id
  const {tweetId} = request.params
  const getTweetQuery = `
  SELECT * 
  FROM tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
  WHERE tweet.tweet_id = '${tweetId}' AND follower.follower_user_id = '${userId}' `
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const {username, userId} = request
    const getTweetQuery = `
  SELECT tweet,
  (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
  (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies ,
  date_time AS dateTime 
  FROM tweet 
  WHERE tweet.tweet_id = '${tweetId}' `
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  },
)

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getQuery = `
  SELECT username 
  FROM user INNER JOIN like ON user.user_id = like.user_id 
  WHERE tweet_id = '${tweetId}' `
    const likedUsers = await db.all(getQuery)
    const userQuery = likedUsers.map(i => i.username)
    response.send({likes: userQuery})
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const query = `
        SELECT name, reply
        FROM reply NATURAL JOIN user
        WHERE tweet_id = ${tweetId};`

    const data = await db.all(query)
    // const namesArray = data.map((each) => each.name);

    response.send({replies: data})
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request.headers
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(getUserQuery)
  const userId = dbUser['user_id']

  const query = `
SELECT tweet,
(SELECT COUNT() FROM like WHERE tweet_id = tweet.tweet_id) AS likes,
(SELECT COUNT() FROM reply WHERE tweet_id = tweet.tweet_id) AS replies,
date_time AS dateTime
FROM tweet
WHERE user_id = ${userId}`

  let likesData = await db.all(query)

  const repliesQuery = `
    SELECT tweet, COUNT() AS replies
    FROM tweet INNER JOIN reply
    ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;`

  const repliesData = await db.all(repliesQuery)

  likesData.forEach(each => {
    for (let data of repliesData) {
      if (each.tweet === data.tweet) {
        each.replies = data.replies
        break
      }
    }
  })
  response.send(likesData)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request.headers
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(getUserQuery)
  const userId = dbUser['user_id']

  const query = `
    INSERT INTO 
        tweet(tweet, user_id)
    VALUES ('${tweet}', ${userId});`
  await db.run(query)
  response.send('Created a Tweet')
})

//API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request.headers
    const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`
    const dbUser = await db.get(getUserQuery)
    const userId = dbUser['user_id']

    const userTweetsQuery = `
    SELECT tweet_id, user_id 
    FROM tweet
    WHERE user_id = ${userId};`
    const userTweetsData = await db.all(userTweetsQuery)

    let isTweetUsers = false
    userTweetsData.forEach(each => {
      if (each['tweet_id'] == tweetId) {
        isTweetUsers = true
      }
    })

    if (isTweetUsers) {
      const query = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId};`
      await db.run(query)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)
