# Step 7: GraphQL Authentication

This is the seventh blog in a multipart series where we will be building Chatty, a WhatsApp clone, using [React Native](https://facebook.github.io/react-native/) and [Apollo](http://dev.apollodata.com/).

In this tutorial, we’ll be adding authentication (auth) to Chatty, solidifying Chatty as a full-fledged MVP messaging app!

Here’s what we will accomplish in this tutorial:
1. Introduce [**JSON Web Tokens (JWT)**](https://jwt.io/introduction/)
2. Build server-side infrastructure for JWT auth with Queries and Mutations
3. Refactor Schemas and Resolvers with auth
4. Build server-side infrastructure for JWT auth with Subscriptions
5. Design login/signup layout in our React Native client
6. Build client-side infrastructure for JWT auth with Queries and Mutations
7. Build client-side infrastructure for JWT auth with Subscriptions
8. Refactor Components, Queries, Mutations, and Subscriptions with auth
9. Reflect on all we’ve accomplished!

Yeah, this one’s gonna be BIG….

# JSON Web Tokens (JWT)
[JSON Web Token (JWT)](http://jwt.io) is an open standard ([RFC 7519](https://tools.ietf.org/html/rfc7519)) for securely sending digitally signed JSONs between parties. JWTs are incredibly cool for authentication because they let us implement reliable Single Sign-On (SSO) with low overhead on any platform (native, web, VR, whatever…) and across domains. JWTs are a strong alternative to pure cookie or session based auth with simple tokens or SAML, which can fail miserably in native app implementations. We can even use cookies with JWTs if we really want.

Without getting into technical details, a JWT is basically just a JSON message that gets all kinds of encoded, hashed, and signed to keep it super secure. Feel free to dig into the details [here](https://jwt.io/introduction/).

For our purposes, we just need to know how to use JWTs within our authentication workflow. When a user logs into our app, the server will check their email and password against the database. If the user exists, we’ll take their `{email: <your-email>, password: <your-pw>}` combination, turn it into a lovely JWT, and send it back to the client. The client can store the JWT forever or until we set it to expire.

Whenever the client wants to ask the server for data, it’ll pass the JWT in the request’s Authorization Header (`Authorization: Bearer <token>`). The server will decode the Authorization Header before executing every request, and the decoded JWT should contain `{email: <your-email>, password: <your-pw>}`. With that data, the server can retrieve the user again via the database or a cache to determine whether the user is allowed to execute the request.

Let’s make it happen!

# JWT Authentication for Queries and Mutations
We can use the excellent [`express-jwt`](https://www.npmjs.com/package/express-jwt) and [`jsonwebtoken`](https://github.com/auth0/node-jsonwebtoken) packages for all our JWT encoding/decoding needs. We’re also going to use [`bcrypt`](https://www.npmjs.com/package/bcrypt) for hashing passwords and [`dotenv`](https://www.npmjs.com/package/dotenv) to set our JWT secret key as an environment variable:
```
yarn add express-jwt jsonwebtoken bcrypt dotenv
```

In a new `.env` file on the root directory, let’s add a `JWT_SECRET` environment variable:

[{]: <helper> (diffStep 7.1 files=".env")

#### Step 7.1: Add environment variables for JWT_SECRET

##### Added .env
```diff
@@ -0,0 +1,3 @@
+┊ ┊1┊# .env
+┊ ┊2┊# use your own secret!!!
+┊ ┊3┊JWT_SECRET=your_secret🚫↵
```

[}]: #

We’ll process the `JWT_SECRET` inside a new file `server/config.js`:

[{]: <helper> (diffStep 7.1 files="server/config.js")

#### Step 7.1: Add environment variables for JWT_SECRET

##### Added server&#x2F;config.js
```diff
@@ -0,0 +1,7 @@
+┊ ┊1┊import dotenv from 'dotenv';
+┊ ┊2┊
+┊ ┊3┊dotenv.config({ silent: true });
+┊ ┊4┊
+┊ ┊5┊export const { JWT_SECRET } = process.env;
+┊ ┊6┊
+┊ ┊7┊export default JWT_SECRET;
```

[}]: #

Now, let’s update our express server in `server/index.js` to use `express-jwt `middleware:

[{]: <helper> (diffStep 7.2)

#### Step 7.2: Add jwt middleware to express

##### Changed server&#x2F;index.js
```diff
@@ -4,7 +4,10 @@
 ┊ 4┊ 4┊import { createServer } from 'http';
 ┊ 5┊ 5┊import { SubscriptionServer } from 'subscriptions-transport-ws';
 ┊ 6┊ 6┊import { execute, subscribe } from 'graphql';
+┊  ┊ 7┊import jwt from 'express-jwt';
 ┊ 7┊ 8┊
+┊  ┊ 9┊import { JWT_SECRET } from './config';
+┊  ┊10┊import { User } from './data/connectors';
 ┊ 8┊11┊import { executableSchema } from './data/schema';
 ┊ 9┊12┊
 ┊10┊13┊const GRAPHQL_PORT = 8080;
```
```diff
@@ -14,10 +17,16 @@
 ┊14┊17┊const app = express();
 ┊15┊18┊
 ┊16┊19┊// `context` must be an object and can't be undefined when using connectors
-┊17┊  ┊app.use('/graphql', bodyParser.json(), graphqlExpress({
+┊  ┊20┊app.use('/graphql', bodyParser.json(), jwt({
+┊  ┊21┊  secret: JWT_SECRET,
+┊  ┊22┊  credentialsRequired: false,
+┊  ┊23┊}), graphqlExpress(req => ({
 ┊18┊24┊  schema: executableSchema,
-┊19┊  ┊  context: {}, // at least(!) an empty object
-┊20┊  ┊}));
+┊  ┊25┊  context: {
+┊  ┊26┊    user: req.user ?
+┊  ┊27┊      User.findOne({ where: { id: req.user.id } }) : Promise.resolve(null),
+┊  ┊28┊  },
+┊  ┊29┊})));
 ┊21┊30┊
 ┊22┊31┊app.use('/graphiql', graphiqlExpress({
 ┊23┊32┊  endpointURL: GRAPHQL_PATH,
```

[}]: #

The `express-jwt` middleware checks our Authorization Header for a `Bearer` token, decodes the token using the `JWT_SECRET` into a JSON object, and then attaches that Object to the request as `req.user`. We can use `req.user` to find the associated `User` in our database  —  we pretty much only need to use the `id` parameter to retrieve the `User` because we can be confident the JWT is secure (more on this later). Lastly, we pass the found User into a `context` parameter in our `graphqlExpress` middleware. By doing this, every one of our Resolvers will get passed a `context` parameter with the `User`, which we will use to validate credentials before touching any data.

Note that by setting `credentialsRequired: false`, we allow non-authenticated requests to pass through the middleware. This is required so we can allow signup and login requests (and others) through the endpoint.

## Refactoring Schemas
Time to focus on our Schema. We need to perform 3 changes to `server/data/schema.js`:
1. Add new GraphQL Mutations for logging in and signing up
2. Add the JWT to the `User` type
3. Since the User will get passed into all the Resolvers automatically via context, we no longer need to pass a `userId` to any queries or mutations, so let’s simplify their inputs!

[{]: <helper> (diffStep 7.3)

#### Step 7.3: Update Schema with auth

##### Changed server&#x2F;data&#x2F;schema.js
```diff
@@ -23,6 +23,7 @@
 ┊23┊23┊    messages: [Message] # messages sent by user
 ┊24┊24┊    groups: [Group] # groups the user belongs to
 ┊25┊25┊    friends: [User] # user's friends/contacts
+┊  ┊26┊    jwt: String # json web token for access
 ┊26┊27┊  }
 ┊27┊28┊
 ┊28┊29┊  # a message sent from a user to a group
```
```diff
@@ -49,13 +50,13 @@
 ┊49┊50┊
 ┊50┊51┊  type Mutation {
 ┊51┊52┊    # send a message to a group
-┊52┊  ┊    createMessage(
-┊53┊  ┊      text: String!, userId: Int!, groupId: Int!
-┊54┊  ┊    ): Message
-┊55┊  ┊    createGroup(name: String!, userIds: [Int], userId: Int!): Group
+┊  ┊53┊    createMessage(text: String!, groupId: Int!): Message
+┊  ┊54┊    createGroup(name: String!, userIds: [Int]): Group
 ┊56┊55┊    deleteGroup(id: Int!): Group
-┊57┊  ┊    leaveGroup(id: Int!, userId: Int!): Group # let user leave group
+┊  ┊56┊    leaveGroup(id: Int!): Group # let user leave group
 ┊58┊57┊    updateGroup(id: Int!, name: String): Group
+┊  ┊58┊    login(email: String!, password: String!): User
+┊  ┊59┊    signup(email: String!, password: String!, username: String): User
 ┊59┊60┊  }
 ┊60┊61┊
 ┊61┊62┊  type Subscription {
```

[}]: #

Because our server is stateless, **we don’t need to create a logout mutation!** The server will test for authorization on every request and login state will solely be kept on the client.

## Refactoring Resolvers
We need to update our Resolvers to handle our new `login` and `signup` Mutations. We can update `server/data/resolvers.js` as follows:

[{]: <helper> (diffStep 7.4)

#### Step 7.4: Update Resolvers with login and signup mutations

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -1,9 +1,12 @@
 ┊ 1┊ 1┊import GraphQLDate from 'graphql-date';
 ┊ 2┊ 2┊import { withFilter } from 'graphql-subscriptions';
 ┊ 3┊ 3┊import { map } from 'lodash';
+┊  ┊ 4┊import bcrypt from 'bcrypt';
+┊  ┊ 5┊import jwt from 'jsonwebtoken';
 ┊ 4┊ 6┊
 ┊ 5┊ 7┊import { Group, Message, User } from './connectors';
 ┊ 6┊ 8┊import { pubsub } from '../subscriptions';
+┊  ┊ 9┊import { JWT_SECRET } from '../config';
 ┊ 7┊10┊
 ┊ 8┊11┊const MESSAGE_ADDED_TOPIC = 'messageAdded';
 ┊ 9┊12┊const GROUP_ADDED_TOPIC = 'groupAdded';
```
```diff
@@ -79,6 +82,51 @@
 ┊ 79┊ 82┊      return Group.findOne({ where: { id } })
 ┊ 80┊ 83┊        .then(group => group.update({ name }));
 ┊ 81┊ 84┊    },
+┊   ┊ 85┊    login(_, { email, password }, ctx) {
+┊   ┊ 86┊      // find user by email
+┊   ┊ 87┊      return User.findOne({ where: { email } }).then((user) => {
+┊   ┊ 88┊        if (user) {
+┊   ┊ 89┊          // validate password
+┊   ┊ 90┊          return bcrypt.compare(password, user.password).then((res) => {
+┊   ┊ 91┊            if (res) {
+┊   ┊ 92┊              // create jwt
+┊   ┊ 93┊              const token = jwt.sign({
+┊   ┊ 94┊                id: user.id,
+┊   ┊ 95┊                email: user.email,
+┊   ┊ 96┊              }, JWT_SECRET);
+┊   ┊ 97┊              user.jwt = token;
+┊   ┊ 98┊              ctx.user = Promise.resolve(user);
+┊   ┊ 99┊              return user;
+┊   ┊100┊            }
+┊   ┊101┊
+┊   ┊102┊            return Promise.reject('password incorrect');
+┊   ┊103┊          });
+┊   ┊104┊        }
+┊   ┊105┊
+┊   ┊106┊        return Promise.reject('email not found');
+┊   ┊107┊      });
+┊   ┊108┊    },
+┊   ┊109┊    signup(_, { email, password, username }, ctx) {
+┊   ┊110┊      // find user by email
+┊   ┊111┊      return User.findOne({ where: { email } }).then((existing) => {
+┊   ┊112┊        if (!existing) {
+┊   ┊113┊          // hash password and create user
+┊   ┊114┊          return bcrypt.hash(password, 10).then(hash => User.create({
+┊   ┊115┊            email,
+┊   ┊116┊            password: hash,
+┊   ┊117┊            username: username || email,
+┊   ┊118┊          })).then((user) => {
+┊   ┊119┊            const { id } = user;
+┊   ┊120┊            const token = jwt.sign({ id, email }, JWT_SECRET);
+┊   ┊121┊            user.jwt = token;
+┊   ┊122┊            ctx.user = Promise.resolve(user);
+┊   ┊123┊            return user;
+┊   ┊124┊          });
+┊   ┊125┊        }
+┊   ┊126┊
+┊   ┊127┊        return Promise.reject('email already exists'); // email already exists
+┊   ┊128┊      });
+┊   ┊129┊    },
 ┊ 82┊130┊  },
 ┊ 83┊131┊  Subscription: {
 ┊ 84┊132┊    messageAdded: {
```

[}]: #

Let’s break this code down a bit. First let’s look at `login`:
1. We search our database for the `User` with the supplied `email`
2. If the `User` exists, we use `bcrypt` to compare the `User`’s password (we store a hashed version of the password in the database for security) with the supplied password
3. If the passwords match, we create a JWT with the `User`’s `id` and `email`
4. We return the `User` with the JWT attached and also attach a `User` Promise to `context` to pass down to other resolvers.

The code for `signup` is very similar:
1. We search our database for the `User` with the supplied `email`
2. If no `User` with that `email` exists yet, we hash the supplied password and create a new `User` with the email, hashed password, and username (which defaults to email if no username is supplied)
3. We return the new `User` with the JWT attached and also attach a `User` Promise to context to pass down to other resolvers.

We need to also change our fake data generator in `server/data/connectors.js` to hash passwords before they’re stored in the database:

[{]: <helper> (diffStep 7.5)

#### Step 7.5: Update fake data with hashed passwords

##### Changed server&#x2F;data&#x2F;connectors.js
```diff
@@ -1,6 +1,7 @@
 ┊1┊1┊import { _ } from 'lodash';
 ┊2┊2┊import faker from 'faker';
 ┊3┊3┊import Sequelize from 'sequelize';
+┊ ┊4┊import bcrypt from 'bcrypt';
 ┊4┊5┊
 ┊5┊6┊// initialize our database
 ┊6┊7┊const db = new Sequelize('chatty', null, null, {
```
```diff
@@ -53,10 +54,10 @@
 ┊53┊54┊  name: faker.lorem.words(3),
 ┊54┊55┊}).then(group => _.times(USERS_PER_GROUP, () => {
 ┊55┊56┊  const password = faker.internet.password();
-┊56┊  ┊  return group.createUser({
+┊  ┊57┊  return bcrypt.hash(password, 10).then(hash => group.createUser({
 ┊57┊58┊    email: faker.internet.email(),
 ┊58┊59┊    username: faker.internet.userName(),
-┊59┊  ┊    password,
+┊  ┊60┊    password: hash,
 ┊60┊61┊  }).then((user) => {
 ┊61┊62┊    console.log(
 ┊62┊63┊      '{email, username, password}',
```
```diff
@@ -68,7 +69,7 @@
 ┊68┊69┊      text: faker.lorem.sentences(3),
 ┊69┊70┊    }));
 ┊70┊71┊    return user;
-┊71┊  ┊  });
+┊  ┊72┊  }));
 ┊72┊73┊})).then((userPromises) => {
 ┊73┊74┊  // make users friends with all users in the group
 ┊74┊75┊  Promise.all(userPromises).then((users) => {
```

[}]: #

Sweet! Now let’s refactor our Type, Query, and Mutation resolvers to use authentication to protect our data. Our earlier changes to `graphqlExpress` will attach a `context` parameter with the authenticated User to every request on our GraphQL endpoint. We consume `context` (`ctx`) in the Resolvers to build security around our data. For example, we might change `createMessage` to look something like this:

```
// this isn't good enough!!!
createMessage(_, { groupId, text }, ctx) {
  if (!ctx.user) {
    return Promise.reject('Unauthorized');
  }
  return ctx.user.then((user)=> {
    if(!user) {
      return Promise.reject('Unauthorized');
    }
    return Message.create({
      userId: user.id,
      text,
      groupId,
    }).then((message) => {
      // Publish subscription notification with the whole message
      pubsub.publish('messageAdded', message);
      return message;
    });
  });
},
```
This is a start, but it doesn’t give us the security we really need. Users would be able to create messages for *any group*, not just their own groups. We could build this logic into the resolver, but we’re likely going to need to reuse logic for other Queries and Mutations. Our best move is to create a [**business logic layer**](http://graphql.org/learn/thinking-in-graphs/#business-logic-layer) in between our Connectors and Resolvers that will perform authorization checks. By putting this business logic layer in between our Connectors and Resolvers, we can incrementally add business logic to our application one Type/Query/Mutation at a time without breaking others.

In the Apollo docs, this layer is occasionally referred to as the `models` layer, but that name [can be confusing](https://github.com/apollographql/graphql-server/issues/118), so let’s just call it `logic`.

Let’s create a new file `server/data/logic.js` where we’ll start compiling our business logic:

[{]: <helper> (diffStep 7.6)

#### Step 7.6: Create logic.js

##### Added server&#x2F;data&#x2F;logic.js
```diff
@@ -0,0 +1,28 @@
+┊  ┊ 1┊import { Message } from './connectors';
+┊  ┊ 2┊
+┊  ┊ 3┊// reusable function to check for a user with context
+┊  ┊ 4┊function getAuthenticatedUser(ctx) {
+┊  ┊ 5┊  return ctx.user.then((user) => {
+┊  ┊ 6┊    if (!user) {
+┊  ┊ 7┊      return Promise.reject('Unauthorized');
+┊  ┊ 8┊    }
+┊  ┊ 9┊    return user;
+┊  ┊10┊  });
+┊  ┊11┊}
+┊  ┊12┊
+┊  ┊13┊export const messageLogic = {
+┊  ┊14┊  createMessage(_, { text, groupId }, ctx) {
+┊  ┊15┊    return getAuthenticatedUser(ctx)
+┊  ┊16┊      .then(user => user.getGroups({ where: { id: groupId }, attributes: ['id'] })
+┊  ┊17┊      .then((group) => {
+┊  ┊18┊        if (group.length) {
+┊  ┊19┊          return Message.create({
+┊  ┊20┊            userId: user.id,
+┊  ┊21┊            text,
+┊  ┊22┊            groupId,
+┊  ┊23┊          });
+┊  ┊24┊        }
+┊  ┊25┊        return Promise.reject('Unauthorized');
+┊  ┊26┊      }));
+┊  ┊27┊  },
+┊  ┊28┊};
```

[}]: #

We’ve separated out the function `getAuthenticatedUser` to check whether a `User` is making a request. We’ll be able to reuse this function across our logic for other requests.

Now we can start injecting this logic into our Resolvers:

[{]: <helper> (diffStep 7.7)

#### Step 7.7: Apply messageLogic to createMessage resolver

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -7,6 +7,7 @@
 ┊ 7┊ 7┊import { Group, Message, User } from './connectors';
 ┊ 8┊ 8┊import { pubsub } from '../subscriptions';
 ┊ 9┊ 9┊import { JWT_SECRET } from '../config';
+┊  ┊10┊import { messageLogic } from './logic';
 ┊10┊11┊
 ┊11┊12┊const MESSAGE_ADDED_TOPIC = 'messageAdded';
 ┊12┊13┊const GROUP_ADDED_TOPIC = 'groupAdded';
```
```diff
@@ -28,16 +29,13 @@
 ┊28┊29┊    },
 ┊29┊30┊  },
 ┊30┊31┊  Mutation: {
-┊31┊  ┊    createMessage(_, { text, userId, groupId }) {
-┊32┊  ┊      return Message.create({
-┊33┊  ┊        userId,
-┊34┊  ┊        text,
-┊35┊  ┊        groupId,
-┊36┊  ┊      }).then((message) => {
-┊37┊  ┊        // publish subscription notification with the whole message
-┊38┊  ┊        pubsub.publish(MESSAGE_ADDED_TOPIC, { [MESSAGE_ADDED_TOPIC]: message });
-┊39┊  ┊        return message;
-┊40┊  ┊      });
+┊  ┊32┊    createMessage(_, args, ctx) {
+┊  ┊33┊      return messageLogic.createMessage(_, args, ctx)
+┊  ┊34┊        .then((message) => {
+┊  ┊35┊          // Publish subscription notification with message
+┊  ┊36┊          pubsub.publish(MESSAGE_ADDED_TOPIC, { [MESSAGE_ADDED_TOPIC]: message });
+┊  ┊37┊          return message;
+┊  ┊38┊        });
 ┊41┊39┊    },
 ┊42┊40┊    createGroup(_, { name, userIds, userId }) {
 ┊43┊41┊      return User.findOne({ where: { id: userId } })
```

[}]: #

`createMessage` will return the result of the logic in `messageLogic`,  which returns a Promise that either successfully resolves to the new `Message` or rejects due to failed authorization.

Let’s fill out our logic in `server/data/logic.js` to cover all GraphQL Types, Queries and Mutations:

[{]: <helper> (diffStep 7.8)

#### Step 7.8: Create logic for all Resolvers

##### Changed server&#x2F;data&#x2F;logic.js
```diff
@@ -1,4 +1,4 @@
-┊1┊ ┊import { Message } from './connectors';
+┊ ┊1┊import { Group, Message, User } from './connectors';
 ┊2┊2┊
 ┊3┊3┊// reusable function to check for a user with context
 ┊4┊4┊function getAuthenticatedUser(ctx) {
```
```diff
@@ -11,6 +11,12 @@
 ┊11┊11┊}
 ┊12┊12┊
 ┊13┊13┊export const messageLogic = {
+┊  ┊14┊  from(message) {
+┊  ┊15┊    return message.getUser({ attributes: ['id', 'username'] });
+┊  ┊16┊  },
+┊  ┊17┊  to(message) {
+┊  ┊18┊    return message.getGroup({ attributes: ['id', 'name'] });
+┊  ┊19┊  },
 ┊14┊20┊  createMessage(_, { text, groupId }, ctx) {
 ┊15┊21┊    return getAuthenticatedUser(ctx)
 ┊16┊22┊      .then(user => user.getGroups({ where: { id: groupId }, attributes: ['id'] })
```
```diff
@@ -26,3 +32,141 @@
 ┊ 26┊ 32┊      }));
 ┊ 27┊ 33┊  },
 ┊ 28┊ 34┊};
+┊   ┊ 35┊
+┊   ┊ 36┊export const groupLogic = {
+┊   ┊ 37┊  users(group) {
+┊   ┊ 38┊    return group.getUsers({ attributes: ['id', 'username'] });
+┊   ┊ 39┊  },
+┊   ┊ 40┊  messages(group, args) {
+┊   ┊ 41┊    return Message.findAll({
+┊   ┊ 42┊      where: { groupId: group.id },
+┊   ┊ 43┊      order: [['createdAt', 'DESC']],
+┊   ┊ 44┊      limit: args.limit,
+┊   ┊ 45┊      offset: args.offset,
+┊   ┊ 46┊    });
+┊   ┊ 47┊  },
+┊   ┊ 48┊  query(_, { id }, ctx) {
+┊   ┊ 49┊    return getAuthenticatedUser(ctx).then(user => Group.findOne({
+┊   ┊ 50┊      where: { id },
+┊   ┊ 51┊      include: [{
+┊   ┊ 52┊        model: User,
+┊   ┊ 53┊        where: { id: user.id },
+┊   ┊ 54┊      }],
+┊   ┊ 55┊    }));
+┊   ┊ 56┊  },
+┊   ┊ 57┊  createGroup(_, { name, userIds }, ctx) {
+┊   ┊ 58┊    return getAuthenticatedUser(ctx)
+┊   ┊ 59┊      .then(user => user.getFriends({ where: { id: { $in: userIds } } })
+┊   ┊ 60┊      .then((friends) => {  // eslint-disable-line arrow-body-style
+┊   ┊ 61┊        return Group.create({
+┊   ┊ 62┊          name,
+┊   ┊ 63┊        }).then((group) => {  // eslint-disable-line arrow-body-style
+┊   ┊ 64┊          return group.addUsers([user, ...friends]).then(() => {
+┊   ┊ 65┊            group.users = [user, ...friends];
+┊   ┊ 66┊            return group;
+┊   ┊ 67┊          });
+┊   ┊ 68┊        });
+┊   ┊ 69┊      }));
+┊   ┊ 70┊  },
+┊   ┊ 71┊  deleteGroup(_, { id }, ctx) {
+┊   ┊ 72┊    return getAuthenticatedUser(ctx).then((user) => { // eslint-disable-line arrow-body-style
+┊   ┊ 73┊      return Group.findOne({
+┊   ┊ 74┊        where: { id },
+┊   ┊ 75┊        include: [{
+┊   ┊ 76┊          model: User,
+┊   ┊ 77┊          where: { id: user.id },
+┊   ┊ 78┊        }],
+┊   ┊ 79┊      }).then(group => group.getUsers()
+┊   ┊ 80┊        .then(users => group.removeUsers(users))
+┊   ┊ 81┊        .then(() => Message.destroy({ where: { groupId: group.id } }))
+┊   ┊ 82┊        .then(() => group.destroy()));
+┊   ┊ 83┊    });
+┊   ┊ 84┊  },
+┊   ┊ 85┊  leaveGroup(_, { id }, ctx) {
+┊   ┊ 86┊    return getAuthenticatedUser(ctx).then((user) => {
+┊   ┊ 87┊      if (!user) {
+┊   ┊ 88┊        return Promise.reject('Unauthorized');
+┊   ┊ 89┊      }
+┊   ┊ 90┊
+┊   ┊ 91┊      return Group.findOne({
+┊   ┊ 92┊        where: { id },
+┊   ┊ 93┊        include: [{
+┊   ┊ 94┊          model: User,
+┊   ┊ 95┊          where: { id: user.id },
+┊   ┊ 96┊        }],
+┊   ┊ 97┊      }).then((group) => {
+┊   ┊ 98┊        if (!group) {
+┊   ┊ 99┊          Promise.reject('No group found');
+┊   ┊100┊        }
+┊   ┊101┊
+┊   ┊102┊        group.removeUser(user.id);
+┊   ┊103┊        return Promise.resolve({ id });
+┊   ┊104┊      });
+┊   ┊105┊    });
+┊   ┊106┊  },
+┊   ┊107┊  updateGroup(_, { id, name }, ctx) {
+┊   ┊108┊    return getAuthenticatedUser(ctx).then((user) => {  // eslint-disable-line arrow-body-style
+┊   ┊109┊      return Group.findOne({
+┊   ┊110┊        where: { id },
+┊   ┊111┊        include: [{
+┊   ┊112┊          model: User,
+┊   ┊113┊          where: { id: user.id },
+┊   ┊114┊        }],
+┊   ┊115┊      }).then(group => group.update({ name }));
+┊   ┊116┊    });
+┊   ┊117┊  },
+┊   ┊118┊};
+┊   ┊119┊
+┊   ┊120┊export const userLogic = {
+┊   ┊121┊  email(user, args, ctx) {
+┊   ┊122┊    return getAuthenticatedUser(ctx).then((currentUser) => {
+┊   ┊123┊      if (currentUser.id === user.id) {
+┊   ┊124┊        return currentUser.email;
+┊   ┊125┊      }
+┊   ┊126┊
+┊   ┊127┊      return Promise.reject('Unauthorized');
+┊   ┊128┊    });
+┊   ┊129┊  },
+┊   ┊130┊  friends(user, args, ctx) {
+┊   ┊131┊    return getAuthenticatedUser(ctx).then((currentUser) => {
+┊   ┊132┊      if (currentUser.id !== user.id) {
+┊   ┊133┊        return Promise.reject('Unauthorized');
+┊   ┊134┊      }
+┊   ┊135┊
+┊   ┊136┊      return user.getFriends({ attributes: ['id', 'username'] });
+┊   ┊137┊    });
+┊   ┊138┊  },
+┊   ┊139┊  groups(user, args, ctx) {
+┊   ┊140┊    return getAuthenticatedUser(ctx).then((currentUser) => {
+┊   ┊141┊      if (currentUser.id !== user.id) {
+┊   ┊142┊        return Promise.reject('Unauthorized');
+┊   ┊143┊      }
+┊   ┊144┊
+┊   ┊145┊      return user.getGroups();
+┊   ┊146┊    });
+┊   ┊147┊  },
+┊   ┊148┊  jwt(user) {
+┊   ┊149┊    return Promise.resolve(user.jwt);
+┊   ┊150┊  },
+┊   ┊151┊  messages(user, args, ctx) {
+┊   ┊152┊    return getAuthenticatedUser(ctx).then((currentUser) => {
+┊   ┊153┊      if (currentUser.id !== user.id) {
+┊   ┊154┊        return Promise.reject('Unauthorized');
+┊   ┊155┊      }
+┊   ┊156┊
+┊   ┊157┊      return Message.findAll({
+┊   ┊158┊        where: { userId: user.id },
+┊   ┊159┊        order: [['createdAt', 'DESC']],
+┊   ┊160┊      });
+┊   ┊161┊    });
+┊   ┊162┊  },
+┊   ┊163┊  query(_, args, ctx) {
+┊   ┊164┊    return getAuthenticatedUser(ctx).then((user) => {
+┊   ┊165┊      if (user.id === args.id || user.email === args.email) {
+┊   ┊166┊        return user;
+┊   ┊167┊      }
+┊   ┊168┊
+┊   ┊169┊      return Promise.reject('Unauthorized');
+┊   ┊170┊    });
+┊   ┊171┊  },
+┊   ┊172┊};
```

[}]: #

And now let’s apply that logic to the Resolvers in `server/data/resolvers.js`:

[{]: <helper> (diffStep 7.9)

#### Step 7.9: Apply logic to all Resolvers

##### Changed server&#x2F;data&#x2F;logic.js
```diff
@@ -99,8 +99,15 @@
 ┊ 99┊ 99┊          Promise.reject('No group found');
 ┊100┊100┊        }
 ┊101┊101┊
-┊102┊   ┊        group.removeUser(user.id);
-┊103┊   ┊        return Promise.resolve({ id });
+┊   ┊102┊        return group.removeUser(user.id)
+┊   ┊103┊          .then(() => group.getUsers())
+┊   ┊104┊          .then((users) => {
+┊   ┊105┊            // if the last user is leaving, remove the group
+┊   ┊106┊            if (!users.length) {
+┊   ┊107┊              group.destroy();
+┊   ┊108┊            }
+┊   ┊109┊            return { id };
+┊   ┊110┊          });
 ┊104┊111┊      });
 ┊105┊112┊    });
 ┊106┊113┊  },
```

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -7,7 +7,7 @@
 ┊ 7┊ 7┊import { Group, Message, User } from './connectors';
 ┊ 8┊ 8┊import { pubsub } from '../subscriptions';
 ┊ 9┊ 9┊import { JWT_SECRET } from '../config';
-┊10┊  ┊import { messageLogic } from './logic';
+┊  ┊10┊import { groupLogic, messageLogic, userLogic } from './logic';
 ┊11┊11┊
 ┊12┊12┊const MESSAGE_ADDED_TOPIC = 'messageAdded';
 ┊13┊13┊const GROUP_ADDED_TOPIC = 'groupAdded';
```
```diff
@@ -15,17 +15,11 @@
 ┊15┊15┊export const Resolvers = {
 ┊16┊16┊  Date: GraphQLDate,
 ┊17┊17┊  Query: {
-┊18┊  ┊    group(_, args) {
-┊19┊  ┊      return Group.find({ where: args });
+┊  ┊18┊    group(_, args, ctx) {
+┊  ┊19┊      return groupLogic.query(_, args, ctx);
 ┊20┊20┊    },
-┊21┊  ┊    messages(_, args) {
-┊22┊  ┊      return Message.findAll({
-┊23┊  ┊        where: args,
-┊24┊  ┊        order: [['createdAt', 'DESC']],
-┊25┊  ┊      });
-┊26┊  ┊    },
-┊27┊  ┊    user(_, args) {
-┊28┊  ┊      return User.findOne({ where: args });
+┊  ┊21┊    user(_, args, ctx) {
+┊  ┊22┊      return userLogic.query(_, args, ctx);
 ┊29┊23┊    },
 ┊30┊24┊  },
 ┊31┊25┊  Mutation: {
```
```diff
@@ -37,48 +31,20 @@
 ┊37┊31┊          return message;
 ┊38┊32┊        });
 ┊39┊33┊    },
-┊40┊  ┊    createGroup(_, { name, userIds, userId }) {
-┊41┊  ┊      return User.findOne({ where: { id: userId } })
-┊42┊  ┊        .then(user => user.getFriends({ where: { id: { $in: userIds } } })
-┊43┊  ┊          .then(friends => Group.create({
-┊44┊  ┊            name,
-┊45┊  ┊            users: [user, ...friends],
-┊46┊  ┊          })
-┊47┊  ┊            .then(group => group.addUsers([user, ...friends])
-┊48┊  ┊              .then((res) => {
-┊49┊  ┊                // append the user list to the group object
-┊50┊  ┊                // to pass to pubsub so we can check members
-┊51┊  ┊                group.users = [user, ...friends];
-┊52┊  ┊                pubsub.publish(GROUP_ADDED_TOPIC, { [GROUP_ADDED_TOPIC]: group });
-┊53┊  ┊                return group;
-┊54┊  ┊              })),
-┊55┊  ┊          ),
-┊56┊  ┊        );
-┊57┊  ┊    },
-┊58┊  ┊    deleteGroup(_, { id }) {
-┊59┊  ┊      return Group.find({ where: id })
-┊60┊  ┊        .then(group => group.getUsers()
-┊61┊  ┊          .then(users => group.removeUsers(users))
-┊62┊  ┊          .then(() => Message.destroy({ where: { groupId: group.id } }))
-┊63┊  ┊          .then(() => group.destroy()),
-┊64┊  ┊        );
-┊65┊  ┊    },
-┊66┊  ┊    leaveGroup(_, { id, userId }) {
-┊67┊  ┊      return Group.findOne({ where: { id } })
-┊68┊  ┊        .then(group => group.removeUser(userId)
-┊69┊  ┊          .then(() => group.getUsers())
-┊70┊  ┊          .then((users) => {
-┊71┊  ┊            // if the last user is leaving, remove the group
-┊72┊  ┊            if (!users.length) {
-┊73┊  ┊              group.destroy();
-┊74┊  ┊            }
-┊75┊  ┊            return { id };
-┊76┊  ┊          }),
-┊77┊  ┊        );
+┊  ┊34┊    createGroup(_, args, ctx) {
+┊  ┊35┊      return groupLogic.createGroup(_, args, ctx).then((group) => {
+┊  ┊36┊        pubsub.publish(GROUP_ADDED_TOPIC, { [GROUP_ADDED_TOPIC]: group });
+┊  ┊37┊        return group;
+┊  ┊38┊      });
+┊  ┊39┊    },
+┊  ┊40┊    deleteGroup(_, args, ctx) {
+┊  ┊41┊      return groupLogic.deleteGroup(_, args, ctx);
+┊  ┊42┊    },
+┊  ┊43┊    leaveGroup(_, args, ctx) {
+┊  ┊44┊      return groupLogic.leaveGroup(_, args, ctx);
 ┊78┊45┊    },
-┊79┊  ┊    updateGroup(_, { id, name }) {
-┊80┊  ┊      return Group.findOne({ where: { id } })
-┊81┊  ┊        .then(group => group.update({ name }));
+┊  ┊46┊    updateGroup(_, args, ctx) {
+┊  ┊47┊      return groupLogic.updateGroup(_, args, ctx);
 ┊82┊48┊    },
 ┊83┊49┊    login(_, { email, password }, ctx) {
 ┊84┊50┊      // find user by email
```
```diff
@@ -145,38 +111,36 @@
 ┊145┊111┊    },
 ┊146┊112┊  },
 ┊147┊113┊  Group: {
-┊148┊   ┊    users(group) {
-┊149┊   ┊      return group.getUsers();
-┊150┊   ┊    },
-┊151┊   ┊    messages(group, args) {
-┊152┊   ┊      return Message.findAll({
-┊153┊   ┊        where: { groupId: group.id },
-┊154┊   ┊        order: [['createdAt', 'DESC']],
-┊155┊   ┊        limit: args.limit,
-┊156┊   ┊        offset: args.offset,
-┊157┊   ┊      });
+┊   ┊114┊    users(group, args, ctx) {
+┊   ┊115┊      return groupLogic.users(group, args, ctx);
+┊   ┊116┊    },
+┊   ┊117┊    messages(group, args, ctx) {
+┊   ┊118┊      return groupLogic.messages(group, args, ctx);
 ┊158┊119┊    },
 ┊159┊120┊  },
 ┊160┊121┊  Message: {
-┊161┊   ┊    to(message) {
-┊162┊   ┊      return message.getGroup();
+┊   ┊122┊    to(message, args, ctx) {
+┊   ┊123┊      return messageLogic.to(message, args, ctx);
 ┊163┊124┊    },
-┊164┊   ┊    from(message) {
-┊165┊   ┊      return message.getUser();
+┊   ┊125┊    from(message, args, ctx) {
+┊   ┊126┊      return messageLogic.from(message, args, ctx);
 ┊166┊127┊    },
 ┊167┊128┊  },
 ┊168┊129┊  User: {
-┊169┊   ┊    messages(user) {
-┊170┊   ┊      return Message.findAll({
-┊171┊   ┊        where: { userId: user.id },
-┊172┊   ┊        order: [['createdAt', 'DESC']],
-┊173┊   ┊      });
+┊   ┊130┊    email(user, args, ctx) {
+┊   ┊131┊      return userLogic.email(user, args, ctx);
+┊   ┊132┊    },
+┊   ┊133┊    friends(user, args, ctx) {
+┊   ┊134┊      return userLogic.friends(user, args, ctx);
+┊   ┊135┊    },
+┊   ┊136┊    groups(user, args, ctx) {
+┊   ┊137┊      return userLogic.groups(user, args, ctx);
 ┊174┊138┊    },
-┊175┊   ┊    groups(user) {
-┊176┊   ┊      return user.getGroups();
+┊   ┊139┊    jwt(user, args, ctx) {
+┊   ┊140┊      return userLogic.jwt(user, args, ctx);
 ┊177┊141┊    },
-┊178┊   ┊    friends(user) {
-┊179┊   ┊      return user.getFriends();
+┊   ┊142┊    messages(user, args, ctx) {
+┊   ┊143┊      return userLogic.messages(user, args, ctx);
 ┊180┊144┊    },
 ┊181┊145┊  },
 ┊182┊146┊};
```

[}]: #

So much cleaner and **WAY** more secure!

## The Expired Password Problem
We still have one last thing that needs modifying in our authorization setup. When a user changes their password, we issue a new JWT, but the old JWT will still pass verification! This can become a serious problem if a hacker gets ahold of a user’s password. To close the loop on this issue, we can make a clever little adjustment to our `UserModel` database model to include a `version` parameter, which will be a counter that increments with each new password for the user. We’ll incorporate `version` into our JWT so only the newest JWT will pass our security. Let’s update `graphqlExpress` and our Connectors and Resolvers accordingly:

[{]: <helper> (diffStep "7.10")

#### Step 7.10: Apply versioning to JWT auth

##### Changed server&#x2F;data&#x2F;connectors.js
```diff
@@ -25,6 +25,7 @@
 ┊25┊25┊  email: { type: Sequelize.STRING },
 ┊26┊26┊  username: { type: Sequelize.STRING },
 ┊27┊27┊  password: { type: Sequelize.STRING },
+┊  ┊28┊  version: { type: Sequelize.INTEGER }, // version the password
 ┊28┊29┊});
 ┊29┊30┊
 ┊30┊31┊// users belong to multiple groups
```
```diff
@@ -58,6 +59,7 @@
 ┊58┊59┊    email: faker.internet.email(),
 ┊59┊60┊    username: faker.internet.userName(),
 ┊60┊61┊    password: hash,
+┊  ┊62┊    version: 1,
 ┊61┊63┊  }).then((user) => {
 ┊62┊64┊    console.log(
 ┊63┊65┊      '{email, username, password}',
```

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -57,6 +57,7 @@
 ┊57┊57┊              const token = jwt.sign({
 ┊58┊58┊                id: user.id,
 ┊59┊59┊                email: user.email,
+┊  ┊60┊                version: user.version,
 ┊60┊61┊              }, JWT_SECRET);
 ┊61┊62┊              user.jwt = token;
 ┊62┊63┊              ctx.user = Promise.resolve(user);
```
```diff
@@ -79,9 +80,10 @@
 ┊79┊80┊            email,
 ┊80┊81┊            password: hash,
 ┊81┊82┊            username: username || email,
+┊  ┊83┊            version: 1,
 ┊82┊84┊          })).then((user) => {
 ┊83┊85┊            const { id } = user;
-┊84┊  ┊            const token = jwt.sign({ id, email }, JWT_SECRET);
+┊  ┊86┊            const token = jwt.sign({ id, email, version: 1 }, JWT_SECRET);
 ┊85┊87┊            user.jwt = token;
 ┊86┊88┊            ctx.user = Promise.resolve(user);
 ┊87┊89┊            return user;
```

##### Changed server&#x2F;index.js
```diff
@@ -24,7 +24,8 @@
 ┊24┊24┊  schema: executableSchema,
 ┊25┊25┊  context: {
 ┊26┊26┊    user: req.user ?
-┊27┊  ┊      User.findOne({ where: { id: req.user.id } }) : Promise.resolve(null),
+┊  ┊27┊      User.findOne({ where: { id: req.user.id, version: req.user.version } }) :
+┊  ┊28┊      Promise.resolve(null),
 ┊28┊29┊  },
 ┊29┊30┊})));
```

[}]: #

# Testing
It can’t be understated just how vital testing is to securing our code. Yet, like with most tutorials, testing is noticeably absent from this one. We’re not going to cover proper testing here because it really belongs in its own post and would make this already egregiously long post even longer.

For now, we’ll just use GraphIQL to make sure our code is performing as expected. We’re also going to need a way to modify HTTP headers  —  I recommend the [ModHeader Chrome Extension](https://chrome.google.com/webstore/detail/modheader/idgpnmonknjnojddfkpgkljpfnnfcklj).

Here are the steps to test our protected GraphQL endpoint in GraphIQL:

1. Use the `signup` or `login` mutation to receive a JWT ![Login Image](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step7-10.png)
2. Apply the JWT to the Authorization Header for future requests ![Header Image](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step7-10-2.png)
3. Make whatever authorized `query` or `mutation` requests we want
![Query Image Success](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step7-10-3.png)
![Query Image Fail](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step7-10-4.png)
![Query Image Partial](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step7-10-5.png)

# JWT Authentication for Subscriptions
Our Queries and Mutations are secure, but our Subscriptions are wide open. Right now, any user could subscribe to new messages for all groups, or track when any group is created. The security we’ve already implemented limits the `Message` and `Group` fields a hacker could view, but that’s not good enough! Secure all the things!

In this workflow, we will only allow WebSocket connections once the user is authenticated. Whenever the user is logged off, we terminate the connection, and then reinitiate a new connection the next time they log in. This workflow is suitable for applications that don't require subscriptions while the user isn't logged in and makes it easier to defend against DOS attacks.

Just like with Queries and Mutations, we can pass a `context` parameter to our Subscriptions every time a user connects over WebSockets! When constructing `SubscriptionServer`, we can pass an `onConnect` parameter, which is a function that runs before every connection. The `onConnect` function offers 2 parameters —  `connectionParams` and `webSocket` —  and should return a Promise that resolves the context. 

`connectionParams` is where we will receive the JWT from the client. Inside `onConnect`, we will extract the `User` Promise from the JWT and replace return the `User` Promise as the context. 

We can then pass the context through subscription logic before each subscription using the `onOperation` parameter of `SubscriptionServer`. `onOperation` offers 3 parameters  —  `parsedMessage`, `baseParams`, and `connection`  —  and should return a Promise that resolves `baseParams`. `baseParams.context` is where we receive the context, and it is where the `User` Promise needs to be when it is consumed by the Resolvers.

Let’s first update the `SubscriptionServer` in `server/index.js` to use the JWT:

[{]: <helper> (diffStep 7.11)

#### Step 7.11: Add onConnect and onOperation to SubscriptionServer

##### Changed server&#x2F;index.js
```diff
@@ -5,10 +5,13 @@
 ┊ 5┊ 5┊import { SubscriptionServer } from 'subscriptions-transport-ws';
 ┊ 6┊ 6┊import { execute, subscribe } from 'graphql';
 ┊ 7┊ 7┊import jwt from 'express-jwt';
+┊  ┊ 8┊import jsonwebtoken from 'jsonwebtoken';
 ┊ 8┊ 9┊
 ┊ 9┊10┊import { JWT_SECRET } from './config';
 ┊10┊11┊import { User } from './data/connectors';
+┊  ┊12┊import { getSubscriptionDetails } from './subscriptions'; // make sure this imports before executableSchema!
 ┊11┊13┊import { executableSchema } from './data/schema';
+┊  ┊14┊import { subscriptionLogic } from './data/logic';
 ┊12┊15┊
 ┊13┊16┊const GRAPHQL_PORT = 8080;
 ┊14┊17┊const GRAPHQL_PATH = '/graphql';
```
```diff
@@ -46,6 +49,40 @@
 ┊46┊49┊  schema: executableSchema,
 ┊47┊50┊  execute,
 ┊48┊51┊  subscribe,
+┊  ┊52┊  onConnect(connectionParams, webSocket) {
+┊  ┊53┊    const userPromise = new Promise((res, rej) => {
+┊  ┊54┊      if (connectionParams.jwt) {
+┊  ┊55┊        jsonwebtoken.verify(connectionParams.jwt, JWT_SECRET,
+┊  ┊56┊        (err, decoded) => {
+┊  ┊57┊          if (err) {
+┊  ┊58┊            rej('Invalid Token');
+┊  ┊59┊          }
+┊  ┊60┊
+┊  ┊61┊          res(User.findOne({ where: { id: decoded.id, version: decoded.version } }));
+┊  ┊62┊        });
+┊  ┊63┊      } else {
+┊  ┊64┊        rej('No Token');
+┊  ┊65┊      }
+┊  ┊66┊    });
+┊  ┊67┊
+┊  ┊68┊    return userPromise.then((user) => {
+┊  ┊69┊      if (user) {
+┊  ┊70┊        return { user: Promise.resolve(user) };
+┊  ┊71┊      }
+┊  ┊72┊
+┊  ┊73┊      return Promise.reject('No User');
+┊  ┊74┊    });
+┊  ┊75┊  },
+┊  ┊76┊  onOperation(parsedMessage, baseParams) {
+┊  ┊77┊    // we need to implement this!!!
+┊  ┊78┊    const { subscriptionName, args } = getSubscriptionDetails({
+┊  ┊79┊      baseParams,
+┊  ┊80┊      schema: executableSchema,
+┊  ┊81┊    });
+┊  ┊82┊
+┊  ┊83┊    // we need to implement this too!!!
+┊  ┊84┊    return subscriptionLogic[subscriptionName](baseParams, args, baseParams.context);
+┊  ┊85┊  },
 ┊49┊86┊}, {
 ┊50┊87┊  server: graphQLServer,
 ┊51┊88┊  path: SUBSCRIPTIONS_PATH,
```

[}]: #

First, `onConnect` will use `jsonwebtoken` to verify and decode `connectionParams.jwt` to extract a `User` from the database. It will do this work within a new Promise called `user`.

Second, `onOperation` is going to call a function `getSubscriptionDetails` to extract the subscription name (`subscriptionName`) and arguments (`args`) from `baseParams` using our Schema.

Finally, `onOperation` will pass the `baseParams`, `args`, and `user` to our subscription logic (e.g. `subscriptionLogic.messageAdded`) to verify whether the `User` is authorized to initiate this subscription. `subscriptionLogic.messageAdded` will return a Promise that either resolves `baseParams` or rejects if the subscription is unauthorized.

We still need to write the code for `getSubscriptionDetails` and `subscriptionLogic`.
Let’s start by adding `getSubscriptionDetails` to `server/subscriptions.js`. You don’t really need to understand this code, and hopefully in a future release of `subscriptions-transport-ws`, we’ll bake this in:

[{]: <helper> (diffStep 7.12)

#### Step 7.12: Create getSubscriptionDetails

##### Changed server&#x2F;subscriptions.js
```diff
@@ -1,4 +1,30 @@
 ┊ 1┊ 1┊import { PubSub } from 'graphql-subscriptions';
+┊  ┊ 2┊import { parse } from 'graphql';
+┊  ┊ 3┊import { getArgumentValues } from 'graphql/execution/values';
+┊  ┊ 4┊
+┊  ┊ 5┊export function getSubscriptionDetails({ baseParams, schema }) {
+┊  ┊ 6┊  const parsedQuery = parse(baseParams.query);
+┊  ┊ 7┊  let args = {};
+┊  ┊ 8┊  // operationName is the name of the only root field in the
+┊  ┊ 9┊  // subscription document
+┊  ┊10┊  let subscriptionName = '';
+┊  ┊11┊  parsedQuery.definitions.forEach((definition) => {
+┊  ┊12┊    if (definition.kind === 'OperationDefinition') {
+┊  ┊13┊      // only one root field is allowed on subscription.
+┊  ┊14┊      // No fragments for now.
+┊  ┊15┊      const rootField = (definition).selectionSet.selections[0];
+┊  ┊16┊      subscriptionName = rootField.name.value;
+┊  ┊17┊      const fields = schema.getSubscriptionType().getFields();
+┊  ┊18┊      args = getArgumentValues(
+┊  ┊19┊        fields[subscriptionName],
+┊  ┊20┊        rootField,
+┊  ┊21┊        baseParams.variables,
+┊  ┊22┊      );
+┊  ┊23┊    }
+┊  ┊24┊  });
+┊  ┊25┊
+┊  ┊26┊  return { args, subscriptionName };
+┊  ┊27┊}
 ┊ 2┊28┊
 ┊ 3┊29┊export const pubsub = new PubSub();
```

[}]: #

Now let’s add `subscriptionLogic` to `server/data/logic.js`:

[{]: <helper> (diffStep 7.13)

#### Step 7.13: Create subscriptionLogic

##### Changed server&#x2F;data&#x2F;logic.js
```diff
@@ -177,3 +177,30 @@
 ┊177┊177┊    });
 ┊178┊178┊  },
 ┊179┊179┊};
+┊   ┊180┊
+┊   ┊181┊export const subscriptionLogic = {
+┊   ┊182┊  groupAdded(baseParams, args, ctx) {
+┊   ┊183┊    return getAuthenticatedUser(ctx)
+┊   ┊184┊      .then((user) => {
+┊   ┊185┊        if (user.id !== args.userId) {
+┊   ┊186┊          return Promise.reject('Unauthorized');
+┊   ┊187┊        }
+┊   ┊188┊
+┊   ┊189┊        baseParams.context = ctx;
+┊   ┊190┊        return baseParams;
+┊   ┊191┊      });
+┊   ┊192┊  },
+┊   ┊193┊  messageAdded(baseParams, args, ctx) {
+┊   ┊194┊    return getAuthenticatedUser(ctx)
+┊   ┊195┊      .then(user => user.getGroups({ where: { id: { $in: args.groupIds } }, attributes: ['id'] })
+┊   ┊196┊      .then((groups) => {
+┊   ┊197┊        // user attempted to subscribe to some groups without access
+┊   ┊198┊        if (args.groupIds.length > groups.length) {
+┊   ┊199┊          return Promise.reject('Unauthorized');
+┊   ┊200┊        }
+┊   ┊201┊
+┊   ┊202┊        baseParams.context = ctx;
+┊   ┊203┊        return baseParams;
+┊   ┊204┊      }));
+┊   ┊205┊  },
+┊   ┊206┊};
```

[}]: #

Unfortunately, given how new this feature is, there’s no easy way to currently test it with GraphIQL, so let’s just hope the code does what it’s supposed to do and move on for now ¯\_(ツ)_/¯

## Now would be a good time to take a break!

# GraphQL Authentication in React Native
Our server is now only serving authenticated GraphQL, and our React Native client needs to catch up!

## Designing the Layout
First, let’s design the basic authentication UI/UX for our users.

If a user isn’t authenticated, we want to push a modal Screen asking them to login or sign up and then pop the Screen when they sign in.

Let’s start by creating a Signin screen (`client/src/screens/signin.screen.js`) to display our `login`/`signup` modal:

[{]: <helper> (diffStep 7.14)

#### Step 7.14: Create Signup Screen

##### Added client&#x2F;src&#x2F;screens&#x2F;signin.screen.js
```diff
@@ -0,0 +1,150 @@
+┊   ┊  1┊import React, { Component } from 'react';
+┊   ┊  2┊import PropTypes from 'prop-types';
+┊   ┊  3┊import {
+┊   ┊  4┊  ActivityIndicator,
+┊   ┊  5┊  KeyboardAvoidingView,
+┊   ┊  6┊  Button,
+┊   ┊  7┊  StyleSheet,
+┊   ┊  8┊  Text,
+┊   ┊  9┊  TextInput,
+┊   ┊ 10┊  TouchableOpacity,
+┊   ┊ 11┊  View,
+┊   ┊ 12┊} from 'react-native';
+┊   ┊ 13┊
+┊   ┊ 14┊const styles = StyleSheet.create({
+┊   ┊ 15┊  container: {
+┊   ┊ 16┊    flex: 1,
+┊   ┊ 17┊    justifyContent: 'center',
+┊   ┊ 18┊    backgroundColor: '#eeeeee',
+┊   ┊ 19┊    paddingHorizontal: 50,
+┊   ┊ 20┊  },
+┊   ┊ 21┊  inputContainer: {
+┊   ┊ 22┊    marginBottom: 20,
+┊   ┊ 23┊  },
+┊   ┊ 24┊  input: {
+┊   ┊ 25┊    height: 40,
+┊   ┊ 26┊    borderRadius: 4,
+┊   ┊ 27┊    marginVertical: 6,
+┊   ┊ 28┊    padding: 6,
+┊   ┊ 29┊    backgroundColor: 'rgba(0,0,0,0.2)',
+┊   ┊ 30┊  },
+┊   ┊ 31┊  loadingContainer: {
+┊   ┊ 32┊    left: 0,
+┊   ┊ 33┊    right: 0,
+┊   ┊ 34┊    top: 0,
+┊   ┊ 35┊    bottom: 0,
+┊   ┊ 36┊    position: 'absolute',
+┊   ┊ 37┊    flexDirection: 'row',
+┊   ┊ 38┊    justifyContent: 'center',
+┊   ┊ 39┊    alignItems: 'center',
+┊   ┊ 40┊  },
+┊   ┊ 41┊  switchContainer: {
+┊   ┊ 42┊    flexDirection: 'row',
+┊   ┊ 43┊    justifyContent: 'center',
+┊   ┊ 44┊    marginTop: 12,
+┊   ┊ 45┊  },
+┊   ┊ 46┊  switchAction: {
+┊   ┊ 47┊    paddingHorizontal: 4,
+┊   ┊ 48┊    color: 'blue',
+┊   ┊ 49┊  },
+┊   ┊ 50┊  submit: {
+┊   ┊ 51┊    marginVertical: 6,
+┊   ┊ 52┊  },
+┊   ┊ 53┊});
+┊   ┊ 54┊
+┊   ┊ 55┊class Signin extends Component {
+┊   ┊ 56┊  static navigationOptions = {
+┊   ┊ 57┊    title: 'Chatty',
+┊   ┊ 58┊    headerLeft: null,
+┊   ┊ 59┊  };
+┊   ┊ 60┊
+┊   ┊ 61┊  constructor(props) {
+┊   ┊ 62┊    super(props);
+┊   ┊ 63┊    this.state = {
+┊   ┊ 64┊      view: 'login',
+┊   ┊ 65┊    };
+┊   ┊ 66┊    this.login = this.login.bind(this);
+┊   ┊ 67┊    this.signup = this.signup.bind(this);
+┊   ┊ 68┊    this.switchView = this.switchView.bind(this);
+┊   ┊ 69┊  }
+┊   ┊ 70┊
+┊   ┊ 71┊  // fake for now
+┊   ┊ 72┊  login() {
+┊   ┊ 73┊    console.log('logging in');
+┊   ┊ 74┊    this.setState({ loading: true });
+┊   ┊ 75┊    setTimeout(() => {
+┊   ┊ 76┊      console.log('signing up');
+┊   ┊ 77┊      this.props.navigation.goBack();
+┊   ┊ 78┊    }, 1000);
+┊   ┊ 79┊  }
+┊   ┊ 80┊
+┊   ┊ 81┊  // fake for now
+┊   ┊ 82┊  signup() {
+┊   ┊ 83┊    console.log('signing up');
+┊   ┊ 84┊    this.setState({ loading: true });
+┊   ┊ 85┊    setTimeout(() => {
+┊   ┊ 86┊      this.props.navigation.goBack();
+┊   ┊ 87┊    }, 1000);
+┊   ┊ 88┊  }
+┊   ┊ 89┊
+┊   ┊ 90┊  switchView() {
+┊   ┊ 91┊    this.setState({
+┊   ┊ 92┊      view: this.state.view === 'signup' ? 'login' : 'signup',
+┊   ┊ 93┊    });
+┊   ┊ 94┊  }
+┊   ┊ 95┊
+┊   ┊ 96┊  render() {
+┊   ┊ 97┊    const { view } = this.state;
+┊   ┊ 98┊
+┊   ┊ 99┊    return (
+┊   ┊100┊      <KeyboardAvoidingView
+┊   ┊101┊        behavior={'padding'}
+┊   ┊102┊        style={styles.container}
+┊   ┊103┊      >
+┊   ┊104┊        {this.state.loading ?
+┊   ┊105┊          <View style={styles.loadingContainer}>
+┊   ┊106┊            <ActivityIndicator />
+┊   ┊107┊          </View> : undefined}
+┊   ┊108┊        <View style={styles.inputContainer}>
+┊   ┊109┊          <TextInput
+┊   ┊110┊            onChangeText={email => this.setState({ email })}
+┊   ┊111┊            placeholder={'Email'}
+┊   ┊112┊            style={styles.input}
+┊   ┊113┊          />
+┊   ┊114┊          <TextInput
+┊   ┊115┊            onChangeText={password => this.setState({ password })}
+┊   ┊116┊            placeholder={'Password'}
+┊   ┊117┊            secureTextEntry
+┊   ┊118┊            style={styles.input}
+┊   ┊119┊          />
+┊   ┊120┊        </View>
+┊   ┊121┊        <Button
+┊   ┊122┊          onPress={this[view]}
+┊   ┊123┊          style={styles.submit}
+┊   ┊124┊          title={view === 'signup' ? 'Sign up' : 'Login'}
+┊   ┊125┊          disabled={this.state.loading}
+┊   ┊126┊        />
+┊   ┊127┊        <View style={styles.switchContainer}>
+┊   ┊128┊          <Text>
+┊   ┊129┊            { view === 'signup' ?
+┊   ┊130┊              'Already have an account?' : 'New to Chatty?' }
+┊   ┊131┊          </Text>
+┊   ┊132┊          <TouchableOpacity
+┊   ┊133┊            onPress={this.switchView}
+┊   ┊134┊          >
+┊   ┊135┊            <Text style={styles.switchAction}>
+┊   ┊136┊              {view === 'login' ? 'Sign up' : 'Login'}
+┊   ┊137┊            </Text>
+┊   ┊138┊          </TouchableOpacity>
+┊   ┊139┊        </View>
+┊   ┊140┊      </KeyboardAvoidingView>
+┊   ┊141┊    );
+┊   ┊142┊  }
+┊   ┊143┊}
+┊   ┊144┊Signin.propTypes = {
+┊   ┊145┊  navigation: PropTypes.shape({
+┊   ┊146┊    goBack: PropTypes.func,
+┊   ┊147┊  }),
+┊   ┊148┊};
+┊   ┊149┊
+┊   ┊150┊export default Signin;
```

[}]: #

Next, we’ll add `Signin` to our Navigation. We'll also make sure the `USER_QUERY` attached to `AppWithNavigationState` gets skipped and doesn't query for anything for now. We don’t want to run any queries until a user officially signs in. Right now, we’re just testing the layout, so we don’t want queries to run at all no matter what. `graphql` let’s us pass a `skip` function as an optional parameter to our queries to skip their execution. We can update the code in `client/src/navigation.js` as follows:

[{]: <helper> (diffStep 7.15 files="client/src/navigation.js")

#### Step 7.15: Add Signin to navigation and skip queries

##### Changed client&#x2F;src&#x2F;navigation.js
```diff
@@ -12,6 +12,7 @@
 ┊12┊12┊import FinalizeGroup from './screens/finalize-group.screen';
 ┊13┊13┊import GroupDetails from './screens/group-details.screen';
 ┊14┊14┊import NewGroup from './screens/new-group.screen';
+┊  ┊15┊import Signin from './screens/signin.screen';
 ┊15┊16┊
 ┊16┊17┊import { USER_QUERY } from './graphql/user.query';
 ┊17┊18┊import MESSAGE_ADDED_SUBSCRIPTION from './graphql/message-added.subscription';
```
```diff
@@ -57,6 +58,7 @@
 ┊57┊58┊
 ┊58┊59┊const AppNavigator = StackNavigator({
 ┊59┊60┊  Main: { screen: MainScreenNavigator },
+┊  ┊61┊  Signin: { screen: Signin },
 ┊60┊62┊  Messages: { screen: Messages },
 ┊61┊63┊  GroupDetails: { screen: GroupDetails },
 ┊62┊64┊  NewGroup: { screen: NewGroup },
```
```diff
@@ -143,6 +145,7 @@
 ┊143┊145┊});
 ┊144┊146┊
 ┊145┊147┊const userQuery = graphql(USER_QUERY, {
+┊   ┊148┊  skip: ownProps => true, // fake it -- we'll use ownProps with auth
 ┊146┊149┊  options: () => ({ variables: { id: 1 } }), // fake the user for now
 ┊147┊150┊  props: ({ data: { loading, user, subscribeToMore } }) => ({
 ┊148┊151┊    loading,
```

[}]: #

Lastly, we need to modify the `Groups` screen to push the `Signin` modal and skip querying for anything:

[{]: <helper> (diffStep 7.15 files="client/src/screens/groups.screen.js")

#### Step 7.15: Add Signin to navigation and skip queries

##### Changed client&#x2F;src&#x2F;screens&#x2F;groups.screen.js
```diff
@@ -95,6 +95,9 @@
 ┊ 95┊ 95┊  onPress: PropTypes.func.isRequired,
 ┊ 96┊ 96┊};
 ┊ 97┊ 97┊
+┊   ┊ 98┊// we'll fake signin for now
+┊   ┊ 99┊let IS_SIGNED_IN = false;
+┊   ┊100┊
 ┊ 98┊101┊class Group extends Component {
 ┊ 99┊102┊  constructor(props) {
 ┊100┊103┊    super(props);
```
```diff
@@ -164,8 +167,19 @@
 ┊164┊167┊    this.onRefresh = this.onRefresh.bind(this);
 ┊165┊168┊  }
 ┊166┊169┊
+┊   ┊170┊  componentDidMount() {
+┊   ┊171┊    if (!IS_SIGNED_IN) {
+┊   ┊172┊      IS_SIGNED_IN = true;
+┊   ┊173┊
+┊   ┊174┊      const { navigate } = this.props.navigation;
+┊   ┊175┊
+┊   ┊176┊      navigate('Signin');
+┊   ┊177┊    }
+┊   ┊178┊  }
+┊   ┊179┊
 ┊167┊180┊  onRefresh() {
 ┊168┊181┊    this.props.refetch();
+┊   ┊182┊    // faking unauthorized status
 ┊169┊183┊  }
 ┊170┊184┊
 ┊171┊185┊  keyExtractor = item => item.id;
```
```diff
@@ -238,6 +252,7 @@
 ┊238┊252┊};
 ┊239┊253┊
 ┊240┊254┊const userQuery = graphql(USER_QUERY, {
+┊   ┊255┊  skip: ownProps => true, // fake it -- we'll use ownProps with auth
 ┊241┊256┊  options: () => ({ variables: { id: 1 } }), // fake the user for now
 ┊242┊257┊  props: ({ data: { loading, networkStatus, refetch, user } }) => ({
 ┊243┊258┊    loading, networkStatus, refetch, user,
```

[}]: #

Let’s test out our layout: ![Fake Signin Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step7-15.gif)

# Single Sign-On (SSO) with React Native and Redux
Time to add authentication infrastructure to our React Native client! When a user signs up or logs in, the server is going to return a JWT. Whenever the client makes a GraphQL HTTP request to the server, it needs to pass the JWT in the Authorization Header to verify the request is being sent by the user.

Once we have a JWT, we can use it forever or until we set it to expire. Therefore, we want to store the JWT in our app’s storage so users don’t have to log in every time they restart the app — that’s SSO! We’re also going to want quick access to the JWT for any GraphQL request while the user is active. We can use a combination of [`redux`](http://redux.js.org/), [`redux-persist`](https://github.com/rt2zz/redux-persist), and [`AsyncStorage`](https://facebook.github.io/react-native/docs/asyncstorage.html) to efficiently meet all our demands!
```
# make sure you add this package to the client!!!
cd client
yarn add redux redux-persist redux-thunk seamless-immutable
```
[`redux`](http://redux.js.org/) is the **BOMB**. If you don’t know Redux, [**learn Redux!**](https://egghead.io/courses/getting-started-with-redux)

[`redux-persist`](https://github.com/rt2zz/redux-persist) is an incredible package which let’s us store Redux state in a bunch of different storage engines and rehydrate our Redux store when we restart our app.

[`redux-thunk`](https://github.com/gaearon/redux-thunk) will let us return functions and use Promises to dispatch Redux actions.

[`seamless-immutable`](https://github.com/rtfeldman/seamless-immutable) will help us use Immutable JS data structures within Redux that are backwards-compatible with normal Arrays and Objects.

First, let’s create a reducer for our auth data. We’ll create a new folder `client/src/reducers` for our reducer files to live and create a new file `client/src/reducers/auth.reducer.js` for the auth reducer:

[{]: <helper> (diffStep 7.16 files="client/src/reducers/auth.reducer.js")

#### Step 7.16: Create auth reducer

##### Added client&#x2F;src&#x2F;reducers&#x2F;auth.reducer.js
```diff
@@ -0,0 +1,14 @@
+┊  ┊ 1┊import Immutable from 'seamless-immutable';
+┊  ┊ 2┊
+┊  ┊ 3┊const initialState = Immutable({
+┊  ┊ 4┊  loading: true,
+┊  ┊ 5┊});
+┊  ┊ 6┊
+┊  ┊ 7┊const auth = (state = initialState, action) => {
+┊  ┊ 8┊  switch (action.type) {
+┊  ┊ 9┊    default:
+┊  ┊10┊      return state;
+┊  ┊11┊  }
+┊  ┊12┊};
+┊  ┊13┊
+┊  ┊14┊export default auth;
```

[}]: #

The initial state for store.auth will be `{ loading: true }`. We can combine the auth reducer into our store in `client/src/app.js`:

[{]: <helper> (diffStep 7.17)

#### Step 7.17: Combine auth reducer with reducers

##### Changed client&#x2F;src&#x2F;app.js
```diff
@@ -7,6 +7,7 @@
 ┊ 7┊ 7┊import { SubscriptionClient, addGraphQLSubscriptions } from 'subscriptions-transport-ws';
 ┊ 8┊ 8┊
 ┊ 9┊ 9┊import AppWithNavigationState, { navigationReducer } from './navigation';
+┊  ┊10┊import auth from './reducers/auth.reducer';
 ┊10┊11┊
 ┊11┊12┊const networkInterface = createNetworkInterface({ uri: 'http://localhost:8080/graphql' });
 ┊12┊13┊
```
```diff
@@ -32,6 +33,7 @@
 ┊32┊33┊  combineReducers({
 ┊33┊34┊    apollo: client.reducer(),
 ┊34┊35┊    nav: navigationReducer,
+┊  ┊36┊    auth,
 ┊35┊37┊  }),
 ┊36┊38┊  {}, // initial state
 ┊37┊39┊  composeWithDevTools(
```

[}]: #

Now let’s add `thunk` middleware and persistence with `redux-persist` and `AsyncStorage` to our store in `client/src/app.js`:

[{]: <helper> (diffStep 7.18)

#### Step 7.18: Add persistent storage

##### Changed client&#x2F;src&#x2F;app.js
```diff
@@ -1,10 +1,15 @@
 ┊ 1┊ 1┊import React, { Component } from 'react';
+┊  ┊ 2┊import {
+┊  ┊ 3┊  AsyncStorage,
+┊  ┊ 4┊} from 'react-native';
 ┊ 2┊ 5┊
 ┊ 3┊ 6┊import { ApolloProvider } from 'react-apollo';
 ┊ 4┊ 7┊import { createStore, combineReducers, applyMiddleware } from 'redux';
 ┊ 5┊ 8┊import { composeWithDevTools } from 'redux-devtools-extension';
 ┊ 6┊ 9┊import ApolloClient, { createNetworkInterface } from 'apollo-client';
 ┊ 7┊10┊import { SubscriptionClient, addGraphQLSubscriptions } from 'subscriptions-transport-ws';
+┊  ┊11┊import { persistStore, autoRehydrate } from 'redux-persist';
+┊  ┊12┊import thunk from 'redux-thunk';
 ┊ 8┊13┊
 ┊ 9┊14┊import AppWithNavigationState, { navigationReducer } from './navigation';
 ┊10┊15┊import auth from './reducers/auth.reducer';
```
```diff
@@ -37,10 +42,17 @@
 ┊37┊42┊  }),
 ┊38┊43┊  {}, // initial state
 ┊39┊44┊  composeWithDevTools(
-┊40┊  ┊    applyMiddleware(client.middleware()),
+┊  ┊45┊    applyMiddleware(client.middleware(), thunk),
+┊  ┊46┊    autoRehydrate(),
 ┊41┊47┊  ),
 ┊42┊48┊);
 ┊43┊49┊
+┊  ┊50┊// persistent storage
+┊  ┊51┊persistStore(store, {
+┊  ┊52┊  storage: AsyncStorage,
+┊  ┊53┊  blacklist: ['apollo', 'nav'], // don't persist apollo or nav for now
+┊  ┊54┊});
+┊  ┊55┊
 ┊44┊56┊export default class App extends Component {
 ┊45┊57┊  render() {
 ┊46┊58┊    return (
```

[}]: #

We have set our store data (excluding `apollo`) to persist via React Native’s `AsyncStorage` and to automatically rehydrate the store when the client restarts the app. When the app restarts, a `REHYDRATE` action will execute asyncronously with all the data persisted from the last session. We need to handle that action and properly update our store in our `auth` reducer:

[{]: <helper> (diffStep 7.19)

#### Step 7.19: Handle rehydration in auth reducer

##### Changed client&#x2F;src&#x2F;reducers&#x2F;auth.reducer.js
```diff
@@ -1,3 +1,4 @@
+┊ ┊1┊import { REHYDRATE } from 'redux-persist/constants';
 ┊1┊2┊import Immutable from 'seamless-immutable';
 ┊2┊3┊
 ┊3┊4┊const initialState = Immutable({
```
```diff
@@ -6,6 +7,10 @@
 ┊ 6┊ 7┊
 ┊ 7┊ 8┊const auth = (state = initialState, action) => {
 ┊ 8┊ 9┊  switch (action.type) {
+┊  ┊10┊    case REHYDRATE:
+┊  ┊11┊      // convert persisted data to Immutable and confirm rehydration
+┊  ┊12┊      return Immutable(action.payload.auth || state)
+┊  ┊13┊        .set('loading', false);
 ┊ 9┊14┊    default:
 ┊10┊15┊      return state;
 ┊11┊16┊  }
```

[}]: #

The `auth` state will be `{ loading: true }` until we rehydrate our persisted state.

When the user successfully signs up or logs in, we need to store the user’s id and their JWT within auth. We also need to clear this information when they log out. Let’s create a constants folder `client/src/constants` and file `client/src/constants/constants.js` where we can start declaring Redux action types and write two for setting the current user and logging out:

[{]: <helper> (diffStep "7.20")

#### Step 7.20: Create constants

##### Added client&#x2F;src&#x2F;constants&#x2F;constants.js
```diff
@@ -0,0 +1,3 @@
+┊ ┊1┊// auth constants
+┊ ┊2┊export const LOGOUT = 'LOGOUT';
+┊ ┊3┊export const SET_CURRENT_USER = 'SET_CURRENT_USER';
```

[}]: #

We can add these constants to our `auth` reducer now:

[{]: <helper> (diffStep 7.21)

#### Step 7.21: Handle login/logout in auth reducer

##### Changed client&#x2F;src&#x2F;reducers&#x2F;auth.reducer.js
```diff
@@ -1,6 +1,8 @@
 ┊1┊1┊import { REHYDRATE } from 'redux-persist/constants';
 ┊2┊2┊import Immutable from 'seamless-immutable';
 ┊3┊3┊
+┊ ┊4┊import { LOGOUT, SET_CURRENT_USER } from '../constants/constants';
+┊ ┊5┊
 ┊4┊6┊const initialState = Immutable({
 ┊5┊7┊  loading: true,
 ┊6┊8┊});
```
```diff
@@ -11,6 +13,10 @@
 ┊11┊13┊      // convert persisted data to Immutable and confirm rehydration
 ┊12┊14┊      return Immutable(action.payload.auth || state)
 ┊13┊15┊        .set('loading', false);
+┊  ┊16┊    case SET_CURRENT_USER:
+┊  ┊17┊      return state.merge(action.user);
+┊  ┊18┊    case LOGOUT:
+┊  ┊19┊      return Immutable({ loading: false });
 ┊14┊20┊    default:
 ┊15┊21┊      return state;
 ┊16┊22┊  }
```

[}]: #

The `SET_CURRENT_USER` and `LOGOUT` action types will need to get triggered by `ActionCreators`. Let’s put those in a new folder `client/src/actions` and a new file `client/src/actions/auth.actions.js`:

[{]: <helper> (diffStep 7.22)

#### Step 7.22: Create auth actions

##### Added client&#x2F;src&#x2F;actions&#x2F;auth.actions.js
```diff
@@ -0,0 +1,12 @@
+┊  ┊ 1┊import { client } from '../app';
+┊  ┊ 2┊import { SET_CURRENT_USER, LOGOUT } from '../constants/constants';
+┊  ┊ 3┊
+┊  ┊ 4┊export const setCurrentUser = user => ({
+┊  ┊ 5┊  type: SET_CURRENT_USER,
+┊  ┊ 6┊  user,
+┊  ┊ 7┊});
+┊  ┊ 8┊
+┊  ┊ 9┊export const logout = () => {
+┊  ┊10┊  client.resetStore();
+┊  ┊11┊  return { type: LOGOUT };
+┊  ┊12┊};
```

##### Changed client&#x2F;src&#x2F;app.js
```diff
@@ -30,7 +30,7 @@
 ┊30┊30┊  wsClient,
 ┊31┊31┊);
 ┊32┊32┊
-┊33┊  ┊const client = new ApolloClient({
+┊  ┊33┊export const client = new ApolloClient({
 ┊34┊34┊  networkInterface: networkInterfaceWithSubscriptions,
 ┊35┊35┊});
```

[}]: #

When `logout` is called, we’ll clear all auth data by dispatching `LOGOUT` and also all data in the apollo store by calling [`client.resetStore`](http://dev.apollodata.com/core/apollo-client-api.html#ApolloClient.resetStore).

Let’s tie everything together. We’ll update the `Signin` screen to use our login and signup mutations, and dispatch `setCurrentUser` with the mutation results (the JWT and user’s id).

First we’ll create files for our `login` and `signup` mutations:

[{]: <helper> (diffStep 7.23)

#### Step 7.23: Create login and signup mutations

##### Added client&#x2F;src&#x2F;graphql&#x2F;login.mutation.js
```diff
@@ -0,0 +1,13 @@
+┊  ┊ 1┊import gql from 'graphql-tag';
+┊  ┊ 2┊
+┊  ┊ 3┊const LOGIN_MUTATION = gql`
+┊  ┊ 4┊  mutation login($email: String!, $password: String!) {
+┊  ┊ 5┊    login(email: $email, password: $password) {
+┊  ┊ 6┊      id
+┊  ┊ 7┊      jwt
+┊  ┊ 8┊      username
+┊  ┊ 9┊    }
+┊  ┊10┊  }
+┊  ┊11┊`;
+┊  ┊12┊
+┊  ┊13┊export default LOGIN_MUTATION;
```

##### Added client&#x2F;src&#x2F;graphql&#x2F;signup.mutation.js
```diff
@@ -0,0 +1,13 @@
+┊  ┊ 1┊import gql from 'graphql-tag';
+┊  ┊ 2┊
+┊  ┊ 3┊const SIGNUP_MUTATION = gql`
+┊  ┊ 4┊  mutation signup($email: String!, $password: String!) {
+┊  ┊ 5┊    signup(email: $email, password: $password) {
+┊  ┊ 6┊      id
+┊  ┊ 7┊      jwt
+┊  ┊ 8┊      username
+┊  ┊ 9┊    }
+┊  ┊10┊  }
+┊  ┊11┊`;
+┊  ┊12┊
+┊  ┊13┊export default SIGNUP_MUTATION;
```

[}]: #

We connect these mutations and our Redux store to the `Signin` component with `compose` and `connect`:

[{]: <helper> (diffStep 7.24)

#### Step 7.24: Add login and signup mutations to Signin screen

##### Changed client&#x2F;src&#x2F;screens&#x2F;signin.screen.js
```diff
@@ -2,6 +2,7 @@
 ┊2┊2┊import PropTypes from 'prop-types';
 ┊3┊3┊import {
 ┊4┊4┊  ActivityIndicator,
+┊ ┊5┊  Alert,
 ┊5┊6┊  KeyboardAvoidingView,
 ┊6┊7┊  Button,
 ┊7┊8┊  StyleSheet,
```
```diff
@@ -10,6 +11,14 @@
 ┊10┊11┊  TouchableOpacity,
 ┊11┊12┊  View,
 ┊12┊13┊} from 'react-native';
+┊  ┊14┊import { graphql, compose } from 'react-apollo';
+┊  ┊15┊import { connect } from 'react-redux';
+┊  ┊16┊
+┊  ┊17┊import {
+┊  ┊18┊  setCurrentUser,
+┊  ┊19┊} from '../actions/auth.actions';
+┊  ┊20┊import LOGIN_MUTATION from '../graphql/login.mutation';
+┊  ┊21┊import SIGNUP_MUTATION from '../graphql/signup.mutation';
 ┊13┊22┊
 ┊14┊23┊const styles = StyleSheet.create({
 ┊15┊24┊  container: {
```
```diff
@@ -52,6 +61,10 @@
 ┊52┊61┊  },
 ┊53┊62┊});
 ┊54┊63┊
+┊  ┊64┊function capitalizeFirstLetter(string) {
+┊  ┊65┊  return string[0].toUpperCase() + string.slice(1);
+┊  ┊66┊}
+┊  ┊67┊
 ┊55┊68┊class Signin extends Component {
 ┊56┊69┊  static navigationOptions = {
 ┊57┊70┊    title: 'Chatty',
```
```diff
@@ -68,23 +81,61 @@
 ┊ 68┊ 81┊    this.switchView = this.switchView.bind(this);
 ┊ 69┊ 82┊  }
 ┊ 70┊ 83┊
-┊ 71┊   ┊  // fake for now
+┊   ┊ 84┊  componentWillReceiveProps(nextProps) {
+┊   ┊ 85┊    if (nextProps.auth.jwt) {
+┊   ┊ 86┊      nextProps.navigation.goBack();
+┊   ┊ 87┊    }
+┊   ┊ 88┊  }
+┊   ┊ 89┊
 ┊ 72┊ 90┊  login() {
-┊ 73┊   ┊    console.log('logging in');
-┊ 74┊   ┊    this.setState({ loading: true });
-┊ 75┊   ┊    setTimeout(() => {
-┊ 76┊   ┊      console.log('signing up');
-┊ 77┊   ┊      this.props.navigation.goBack();
-┊ 78┊   ┊    }, 1000);
+┊   ┊ 91┊    const { email, password } = this.state;
+┊   ┊ 92┊
+┊   ┊ 93┊    this.setState({
+┊   ┊ 94┊      loading: true,
+┊   ┊ 95┊    });
+┊   ┊ 96┊
+┊   ┊ 97┊    this.props.login({ email, password })
+┊   ┊ 98┊      .then(({ data: { login: user } }) => {
+┊   ┊ 99┊        this.props.dispatch(setCurrentUser(user));
+┊   ┊100┊        this.setState({
+┊   ┊101┊          loading: false,
+┊   ┊102┊        });
+┊   ┊103┊      }).catch((error) => {
+┊   ┊104┊        this.setState({
+┊   ┊105┊          loading: false,
+┊   ┊106┊        });
+┊   ┊107┊        Alert.alert(
+┊   ┊108┊          `${capitalizeFirstLetter(this.state.view)} error`,
+┊   ┊109┊          error.message,
+┊   ┊110┊          [
+┊   ┊111┊            { text: 'OK', onPress: () => console.log('OK pressed') }, // eslint-disable-line no-console
+┊   ┊112┊            { text: 'Forgot password', onPress: () => console.log('Forgot Pressed'), style: 'cancel' }, // eslint-disable-line no-console
+┊   ┊113┊          ],
+┊   ┊114┊        );
+┊   ┊115┊      });
 ┊ 79┊116┊  }
 ┊ 80┊117┊
-┊ 81┊   ┊  // fake for now
 ┊ 82┊118┊  signup() {
-┊ 83┊   ┊    console.log('signing up');
-┊ 84┊   ┊    this.setState({ loading: true });
-┊ 85┊   ┊    setTimeout(() => {
-┊ 86┊   ┊      this.props.navigation.goBack();
-┊ 87┊   ┊    }, 1000);
+┊   ┊119┊    this.setState({
+┊   ┊120┊      loading: true,
+┊   ┊121┊    });
+┊   ┊122┊    const { email, password } = this.state;
+┊   ┊123┊    this.props.signup({ email, password })
+┊   ┊124┊      .then(({ data: { signup: user } }) => {
+┊   ┊125┊        this.props.dispatch(setCurrentUser(user));
+┊   ┊126┊        this.setState({
+┊   ┊127┊          loading: false,
+┊   ┊128┊        });
+┊   ┊129┊      }).catch((error) => {
+┊   ┊130┊        this.setState({
+┊   ┊131┊          loading: false,
+┊   ┊132┊        });
+┊   ┊133┊        Alert.alert(
+┊   ┊134┊          `${capitalizeFirstLetter(this.state.view)} error`,
+┊   ┊135┊          error.message,
+┊   ┊136┊          [{ text: 'OK', onPress: () => console.log('OK pressed') }],  // eslint-disable-line no-console
+┊   ┊137┊        );
+┊   ┊138┊      });
 ┊ 88┊139┊  }
 ┊ 89┊140┊
 ┊ 90┊141┊  switchView() {
```
```diff
@@ -122,7 +173,7 @@
 ┊122┊173┊          onPress={this[view]}
 ┊123┊174┊          style={styles.submit}
 ┊124┊175┊          title={view === 'signup' ? 'Sign up' : 'Login'}
-┊125┊   ┊          disabled={this.state.loading}
+┊   ┊176┊          disabled={this.state.loading || !!this.props.auth.jwt}
 ┊126┊177┊        />
 ┊127┊178┊        <View style={styles.switchContainer}>
 ┊128┊179┊          <Text>
```
```diff
@@ -145,6 +196,39 @@
 ┊145┊196┊  navigation: PropTypes.shape({
 ┊146┊197┊    goBack: PropTypes.func,
 ┊147┊198┊  }),
+┊   ┊199┊  auth: PropTypes.shape({
+┊   ┊200┊    loading: PropTypes.bool,
+┊   ┊201┊    jwt: PropTypes.string,
+┊   ┊202┊  }),
+┊   ┊203┊  dispatch: PropTypes.func.isRequired,
+┊   ┊204┊  login: PropTypes.func.isRequired,
+┊   ┊205┊  signup: PropTypes.func.isRequired,
 ┊148┊206┊};
 ┊149┊207┊
-┊150┊   ┊export default Signin;
+┊   ┊208┊const login = graphql(LOGIN_MUTATION, {
+┊   ┊209┊  props: ({ mutate }) => ({
+┊   ┊210┊    login: ({ email, password }) =>
+┊   ┊211┊      mutate({
+┊   ┊212┊        variables: { email, password },
+┊   ┊213┊      }),
+┊   ┊214┊  }),
+┊   ┊215┊});
+┊   ┊216┊
+┊   ┊217┊const signup = graphql(SIGNUP_MUTATION, {
+┊   ┊218┊  props: ({ mutate }) => ({
+┊   ┊219┊    signup: ({ email, password }) =>
+┊   ┊220┊      mutate({
+┊   ┊221┊        variables: { email, password },
+┊   ┊222┊      }),
+┊   ┊223┊  }),
+┊   ┊224┊});
+┊   ┊225┊
+┊   ┊226┊const mapStateToProps = ({ auth }) => ({
+┊   ┊227┊  auth,
+┊   ┊228┊});
+┊   ┊229┊
+┊   ┊230┊export default compose(
+┊   ┊231┊  login,
+┊   ┊232┊  signup,
+┊   ┊233┊  connect(mapStateToProps),
+┊   ┊234┊)(Signin);
```

[}]: #

We attached `auth` from our Redux store to `Signin` via `connect(mapStateToProps)`. When we sign up or log in, we call the associated mutation (`signup` or `login`), receive the JWT and id, and dispatch the data with `setCurrentUser`. In `componentWillReceiveProps`, once `auth.jwt` exists, we are logged in and pop the Screen. We’ve also included some simple error messages if things go wrong.

Let’s check it out! ![Signin Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step7-24.gif)

# Apollo-Client Authentication Middleware
We need to add Authorization Headers to our GraphQL requests from React Native before we can resume retrieving data from our auth protected server. We accomplish this by using middleware on `networkInterface` that will attach the headers to every request before they are sent out. This middleware option is elegantly built into `networkInterface` and works really nicely with our Redux setup. We can simply add the following in `client/src/app.js`:

[{]: <helper> (diffStep 7.25)

#### Step 7.25: Add authentication middleware for requests

##### Changed client&#x2F;src&#x2F;app.js
```diff
@@ -16,6 +16,21 @@
 ┊16┊16┊
 ┊17┊17┊const networkInterface = createNetworkInterface({ uri: 'http://localhost:8080/graphql' });
 ┊18┊18┊
+┊  ┊19┊// middleware for requests
+┊  ┊20┊networkInterface.use([{
+┊  ┊21┊  applyMiddleware(req, next) {
+┊  ┊22┊    if (!req.options.headers) {
+┊  ┊23┊      req.options.headers = {};
+┊  ┊24┊    }
+┊  ┊25┊    // get the authentication token from local storage if it exists
+┊  ┊26┊    const jwt = store.getState().auth.jwt;
+┊  ┊27┊    if (jwt) {
+┊  ┊28┊      req.options.headers.authorization = `Bearer ${jwt}`;
+┊  ┊29┊    }
+┊  ┊30┊    next();
+┊  ┊31┊  },
+┊  ┊32┊}]);
+┊  ┊33┊
 ┊19┊34┊// Create WebSocket client
 ┊20┊35┊const wsClient = new SubscriptionClient('ws://localhost:8080/subscriptions', {
 ┊21┊36┊  reconnect: true,
```

[}]: #

Before every request, we get the JWT from `auth` and stick it in the header. We can also run middleware *after* receiving responses to check for auth errors and log out the user if necessary:

[{]: <helper> (diffStep 7.26)

#### Step 7.26: Add afterware for responses

##### Changed client&#x2F;src&#x2F;app.js
```diff
@@ -10,9 +10,11 @@
 ┊10┊10┊import { SubscriptionClient, addGraphQLSubscriptions } from 'subscriptions-transport-ws';
 ┊11┊11┊import { persistStore, autoRehydrate } from 'redux-persist';
 ┊12┊12┊import thunk from 'redux-thunk';
+┊  ┊13┊import _ from 'lodash';
 ┊13┊14┊
 ┊14┊15┊import AppWithNavigationState, { navigationReducer } from './navigation';
 ┊15┊16┊import auth from './reducers/auth.reducer';
+┊  ┊17┊import { logout } from './actions/auth.actions';
 ┊16┊18┊
 ┊17┊19┊const networkInterface = createNetworkInterface({ uri: 'http://localhost:8080/graphql' });
 ┊18┊20┊
```
```diff
@@ -31,6 +33,33 @@
 ┊31┊33┊  },
 ┊32┊34┊}]);
 ┊33┊35┊
+┊  ┊36┊// afterware for responses
+┊  ┊37┊networkInterface.useAfter([{
+┊  ┊38┊  applyAfterware({ response }, next) {
+┊  ┊39┊    if (!response.ok) {
+┊  ┊40┊      response.clone().text().then((bodyText) => {
+┊  ┊41┊        console.log(`Network Error: ${response.status} (${response.statusText}) - ${bodyText}`);
+┊  ┊42┊        next();
+┊  ┊43┊      });
+┊  ┊44┊    } else {
+┊  ┊45┊      let isUnauthorized = false;
+┊  ┊46┊      response.clone().json().then(({ errors }) => {
+┊  ┊47┊        if (errors) {
+┊  ┊48┊          console.log('GraphQL Errors:', errors);
+┊  ┊49┊          if (_.some(errors, { message: 'Unauthorized' })) {
+┊  ┊50┊            isUnauthorized = true;
+┊  ┊51┊          }
+┊  ┊52┊        }
+┊  ┊53┊      }).then(() => {
+┊  ┊54┊        if (isUnauthorized) {
+┊  ┊55┊          store.dispatch(logout());
+┊  ┊56┊        }
+┊  ┊57┊        next();
+┊  ┊58┊      });
+┊  ┊59┊    }
+┊  ┊60┊  },
+┊  ┊61┊}]);
+┊  ┊62┊
 ┊34┊63┊// Create WebSocket client
 ┊35┊64┊const wsClient = new SubscriptionClient('ws://localhost:8080/subscriptions', {
 ┊36┊65┊  reconnect: true,
```

[}]: #

We simply parse the error and dispatch `logout()` if we receive an `Unauthorized` response message.

# Subscriptions-Transport-WS Authentication
Luckily for us, `SubscriptionClient` has a nifty little feature that lets us lazily (on-demand) connect to our WebSocket by setting `lazy: true`. This flag means we will only try to connect the WebSocket when we make our first subscription call, which only happens in our app once the user is authenticated. When we make our connection call, we can pass the JWT credentials via `connectionParams`. When the user logs out, we’ll close the connection and lazily reconnect when a user log back in and resubscribes.

We can update `client/src/app.js` and `client/actions/auth.actions.js` as follows:

[{]: <helper> (diffStep 7.27)

#### Step 7.27: Add lazy connecting to wsClient

##### Changed client&#x2F;src&#x2F;actions&#x2F;auth.actions.js
```diff
@@ -1,4 +1,4 @@
-┊1┊ ┊import { client } from '../app';
+┊ ┊1┊import { client, wsClient } from '../app';
 ┊2┊2┊import { SET_CURRENT_USER, LOGOUT } from '../constants/constants';
 ┊3┊3┊
 ┊4┊4┊export const setCurrentUser = user => ({
```
```diff
@@ -8,5 +8,7 @@
 ┊ 8┊ 8┊
 ┊ 9┊ 9┊export const logout = () => {
 ┊10┊10┊  client.resetStore();
+┊  ┊11┊  wsClient.unsubscribeAll(); // unsubscribe from all subscriptions
+┊  ┊12┊  wsClient.close(); // close the WebSocket connection
 ┊11┊13┊  return { type: LOGOUT };
 ┊12┊14┊};
```

##### Changed client&#x2F;src&#x2F;app.js
```diff
@@ -61,11 +61,13 @@
 ┊61┊61┊}]);
 ┊62┊62┊
 ┊63┊63┊// Create WebSocket client
-┊64┊  ┊const wsClient = new SubscriptionClient('ws://localhost:8080/subscriptions', {
+┊  ┊64┊export const wsClient = new SubscriptionClient('ws://localhost:8080/subscriptions', {
 ┊65┊65┊  reconnect: true,
-┊66┊  ┊  connectionParams: {
-┊67┊  ┊    // Pass any arguments you want for initialization
+┊  ┊66┊  connectionParams() {
+┊  ┊67┊    // get the authentication token from local storage if it exists
+┊  ┊68┊    return { jwt: store.getState().auth.jwt };
 ┊68┊69┊  },
+┊  ┊70┊  lazy: true,
 ┊69┊71┊});
 ┊70┊72┊
 ┊71┊73┊// Extend the network interface with the WebSocket
```

[}]: #

KaBLaM! We’re ready to start using auth across our app!

# Refactoring the Client for Authentication
Our final major hurdle is going to be refactoring all our client code to use the Queries and Mutations we modified for auth and to handle auth UI.

## Logout
To get our feet wet, let’s start by creating a new Screen instead of fixing up an existing one. Let’s create a new Screen for the Settings tab where we will show the current user’s details and give users the option to log out!

We’ll put our new Settings Screen in a new file `client/src/screens/settings.screen.js`:

[{]: <helper> (diffStep 7.28)

#### Step 7.28: Create Settings Screen

##### Added client&#x2F;src&#x2F;screens&#x2F;settings.screen.js
```diff
@@ -0,0 +1,175 @@
+┊   ┊  1┊import React, { Component, PropTypes } from 'react';
+┊   ┊  2┊import {
+┊   ┊  3┊  ActivityIndicator,
+┊   ┊  4┊  Button,
+┊   ┊  5┊  Image,
+┊   ┊  6┊  StyleSheet,
+┊   ┊  7┊  Text,
+┊   ┊  8┊  TextInput,
+┊   ┊  9┊  TouchableOpacity,
+┊   ┊ 10┊  View,
+┊   ┊ 11┊} from 'react-native';
+┊   ┊ 12┊import { connect } from 'react-redux';
+┊   ┊ 13┊import { graphql, compose } from 'react-apollo';
+┊   ┊ 14┊
+┊   ┊ 15┊import USER_QUERY from '../graphql/user.query';
+┊   ┊ 16┊import { logout } from '../actions/auth.actions';
+┊   ┊ 17┊
+┊   ┊ 18┊const styles = StyleSheet.create({
+┊   ┊ 19┊  container: {
+┊   ┊ 20┊    flex: 1,
+┊   ┊ 21┊  },
+┊   ┊ 22┊  email: {
+┊   ┊ 23┊    borderColor: '#777',
+┊   ┊ 24┊    borderBottomWidth: 1,
+┊   ┊ 25┊    borderTopWidth: 1,
+┊   ┊ 26┊    paddingVertical: 8,
+┊   ┊ 27┊    paddingHorizontal: 16,
+┊   ┊ 28┊    fontSize: 16,
+┊   ┊ 29┊  },
+┊   ┊ 30┊  emailHeader: {
+┊   ┊ 31┊    backgroundColor: '#dbdbdb',
+┊   ┊ 32┊    color: '#777',
+┊   ┊ 33┊    paddingHorizontal: 16,
+┊   ┊ 34┊    paddingBottom: 6,
+┊   ┊ 35┊    paddingTop: 32,
+┊   ┊ 36┊    fontSize: 12,
+┊   ┊ 37┊  },
+┊   ┊ 38┊  loading: {
+┊   ┊ 39┊    justifyContent: 'center',
+┊   ┊ 40┊    flex: 1,
+┊   ┊ 41┊  },
+┊   ┊ 42┊  userImage: {
+┊   ┊ 43┊    width: 54,
+┊   ┊ 44┊    height: 54,
+┊   ┊ 45┊    borderRadius: 27,
+┊   ┊ 46┊  },
+┊   ┊ 47┊  imageContainer: {
+┊   ┊ 48┊    paddingRight: 20,
+┊   ┊ 49┊    alignItems: 'center',
+┊   ┊ 50┊  },
+┊   ┊ 51┊  input: {
+┊   ┊ 52┊    color: 'black',
+┊   ┊ 53┊    height: 32,
+┊   ┊ 54┊  },
+┊   ┊ 55┊  inputBorder: {
+┊   ┊ 56┊    borderColor: '#dbdbdb',
+┊   ┊ 57┊    borderBottomWidth: 1,
+┊   ┊ 58┊    borderTopWidth: 1,
+┊   ┊ 59┊    paddingVertical: 8,
+┊   ┊ 60┊  },
+┊   ┊ 61┊  inputInstructions: {
+┊   ┊ 62┊    paddingTop: 6,
+┊   ┊ 63┊    color: '#777',
+┊   ┊ 64┊    fontSize: 12,
+┊   ┊ 65┊    flex: 1,
+┊   ┊ 66┊  },
+┊   ┊ 67┊  userContainer: {
+┊   ┊ 68┊    paddingLeft: 16,
+┊   ┊ 69┊  },
+┊   ┊ 70┊  userInner: {
+┊   ┊ 71┊    flexDirection: 'row',
+┊   ┊ 72┊    alignItems: 'center',
+┊   ┊ 73┊    paddingVertical: 16,
+┊   ┊ 74┊    paddingRight: 16,
+┊   ┊ 75┊  },
+┊   ┊ 76┊});
+┊   ┊ 77┊
+┊   ┊ 78┊class Settings extends Component {
+┊   ┊ 79┊  static navigationOptions = {
+┊   ┊ 80┊    title: 'Settings',
+┊   ┊ 81┊  };
+┊   ┊ 82┊
+┊   ┊ 83┊  constructor(props) {
+┊   ┊ 84┊    super(props);
+┊   ┊ 85┊
+┊   ┊ 86┊    this.state = {};
+┊   ┊ 87┊
+┊   ┊ 88┊    this.logout = this.logout.bind(this);
+┊   ┊ 89┊  }
+┊   ┊ 90┊
+┊   ┊ 91┊  logout() {
+┊   ┊ 92┊    this.props.dispatch(logout());
+┊   ┊ 93┊  }
+┊   ┊ 94┊
+┊   ┊ 95┊  // eslint-disable-next-line
+┊   ┊ 96┊  updateUsername(username) {
+┊   ┊ 97┊    // eslint-disable-next-line
+┊   ┊ 98┊    console.log('TODO: update username');
+┊   ┊ 99┊  }
+┊   ┊100┊
+┊   ┊101┊  render() {
+┊   ┊102┊    const { loading, user } = this.props;
+┊   ┊103┊
+┊   ┊104┊    // render loading placeholder while we fetch data
+┊   ┊105┊    if (loading || !user) {
+┊   ┊106┊      return (
+┊   ┊107┊        <View style={[styles.loading, styles.container]}>
+┊   ┊108┊          <ActivityIndicator />
+┊   ┊109┊        </View>
+┊   ┊110┊      );
+┊   ┊111┊    }
+┊   ┊112┊
+┊   ┊113┊    return (
+┊   ┊114┊      <View style={styles.container}>
+┊   ┊115┊        <View style={styles.userContainer}>
+┊   ┊116┊          <View style={styles.userInner}>
+┊   ┊117┊            <TouchableOpacity style={styles.imageContainer}>
+┊   ┊118┊              <Image
+┊   ┊119┊                style={styles.userImage}
+┊   ┊120┊                source={{ uri: 'https://facebook.github.io/react/img/logo_og.png' }}
+┊   ┊121┊              />
+┊   ┊122┊              <Text>edit</Text>
+┊   ┊123┊            </TouchableOpacity>
+┊   ┊124┊            <Text style={styles.inputInstructions}>
+┊   ┊125┊              Enter your name and add an optional profile picture
+┊   ┊126┊            </Text>
+┊   ┊127┊          </View>
+┊   ┊128┊          <View style={styles.inputBorder}>
+┊   ┊129┊            <TextInput
+┊   ┊130┊              onChangeText={username => this.setState({ username })}
+┊   ┊131┊              placeholder={user.username}
+┊   ┊132┊              style={styles.input}
+┊   ┊133┊              defaultValue={user.username}
+┊   ┊134┊            />
+┊   ┊135┊          </View>
+┊   ┊136┊        </View>
+┊   ┊137┊        <Text style={styles.emailHeader}>{'EMAIL'}</Text>
+┊   ┊138┊        <Text style={styles.email}>{user.email}</Text>
+┊   ┊139┊        <Button title={'Logout'} onPress={this.logout} />
+┊   ┊140┊      </View>
+┊   ┊141┊    );
+┊   ┊142┊  }
+┊   ┊143┊}
+┊   ┊144┊
+┊   ┊145┊Settings.propTypes = {
+┊   ┊146┊  auth: PropTypes.shape({
+┊   ┊147┊    loading: PropTypes.bool,
+┊   ┊148┊    jwt: PropTypes.string,
+┊   ┊149┊  }).isRequired,
+┊   ┊150┊  dispatch: PropTypes.func.isRequired,
+┊   ┊151┊  loading: PropTypes.bool,
+┊   ┊152┊  navigation: PropTypes.shape({
+┊   ┊153┊    navigate: PropTypes.func,
+┊   ┊154┊  }),
+┊   ┊155┊  user: PropTypes.shape({
+┊   ┊156┊    username: PropTypes.string,
+┊   ┊157┊  }),
+┊   ┊158┊};
+┊   ┊159┊
+┊   ┊160┊const userQuery = graphql(USER_QUERY, {
+┊   ┊161┊  skip: ownProps => !ownProps.auth || !ownProps.auth.jwt,
+┊   ┊162┊  options: ({ auth }) => ({ variables: { id: auth.id }, fetchPolicy: 'cache-only' }),
+┊   ┊163┊  props: ({ data: { loading, user } }) => ({
+┊   ┊164┊    loading, user,
+┊   ┊165┊  }),
+┊   ┊166┊});
+┊   ┊167┊
+┊   ┊168┊const mapStateToProps = ({ auth }) => ({
+┊   ┊169┊  auth,
+┊   ┊170┊});
+┊   ┊171┊
+┊   ┊172┊export default compose(
+┊   ┊173┊  connect(mapStateToProps),
+┊   ┊174┊  userQuery,
+┊   ┊175┊)(Settings);
```

[}]: #

The most important pieces of this code we need to focus on is any `auth` related code:
1. We connect `auth` from our Redux store to the component via `connect(mapStateToProps)`
2. We `skip` the `userQuery` unless we have a JWT (`ownProps.auth.jwt`)
3. We show a loading spinner until we’re done loading the user

Let’s add the `Settings` screen to our settings tab in `client/src/navigation.js`. We will also use `navigationReducer` to handle pushing the `Signin` Screen whenever the user logs out or starts the application without being authenticated:

[{]: <helper> (diffStep 7.29)

#### Step 7.29: Add Settings screen and auth logic to Navigation

##### Changed client&#x2F;src&#x2F;navigation.js
```diff
@@ -1,11 +1,11 @@
 ┊ 1┊ 1┊import PropTypes from 'prop-types';
 ┊ 2┊ 2┊import React, { Component } from 'react';
-┊ 3┊  ┊import { addNavigationHelpers, StackNavigator, TabNavigator } from 'react-navigation';
-┊ 4┊  ┊import { Text, View, StyleSheet } from 'react-native';
+┊  ┊ 3┊import { addNavigationHelpers, StackNavigator, TabNavigator, NavigationActions } from 'react-navigation';
 ┊ 5┊ 4┊import { connect } from 'react-redux';
 ┊ 6┊ 5┊import { graphql, compose } from 'react-apollo';
 ┊ 7┊ 6┊import update from 'immutability-helper';
 ┊ 8┊ 7┊import { map } from 'lodash';
+┊  ┊ 8┊import { REHYDRATE } from 'redux-persist/constants';
 ┊ 9┊ 9┊
 ┊10┊10┊import Groups from './screens/groups.screen';
 ┊11┊11┊import Messages from './screens/messages.screen';
```
```diff
@@ -13,6 +13,7 @@
 ┊13┊13┊import GroupDetails from './screens/group-details.screen';
 ┊14┊14┊import NewGroup from './screens/new-group.screen';
 ┊15┊15┊import Signin from './screens/signin.screen';
+┊  ┊16┊import Settings from './screens/settings.screen';
 ┊16┊17┊
 ┊17┊18┊import { USER_QUERY } from './graphql/user.query';
 ┊18┊19┊import MESSAGE_ADDED_SUBSCRIPTION from './graphql/message-added.subscription';
```
```diff
@@ -25,35 +26,10 @@
 ┊25┊26┊  return newDocument.id !== null && existingDocuments.some(doc => newDocument.id === doc.id);
 ┊26┊27┊}
 ┊27┊28┊
-┊28┊  ┊const styles = StyleSheet.create({
-┊29┊  ┊  container: {
-┊30┊  ┊    flex: 1,
-┊31┊  ┊    justifyContent: 'center',
-┊32┊  ┊    alignItems: 'center',
-┊33┊  ┊    backgroundColor: 'white',
-┊34┊  ┊  },
-┊35┊  ┊  tabText: {
-┊36┊  ┊    color: '#777',
-┊37┊  ┊    fontSize: 10,
-┊38┊  ┊    justifyContent: 'center',
-┊39┊  ┊  },
-┊40┊  ┊  selected: {
-┊41┊  ┊    color: 'blue',
-┊42┊  ┊  },
-┊43┊  ┊});
-┊44┊  ┊
-┊45┊  ┊const TestScreen = title => () => (
-┊46┊  ┊  <View style={styles.container}>
-┊47┊  ┊    <Text>
-┊48┊  ┊      {title}
-┊49┊  ┊    </Text>
-┊50┊  ┊  </View>
-┊51┊  ┊);
-┊52┊  ┊
 ┊53┊29┊// tabs in main screen
 ┊54┊30┊const MainScreenNavigator = TabNavigator({
 ┊55┊31┊  Chats: { screen: Groups },
-┊56┊  ┊  Settings: { screen: TestScreen('Settings') },
+┊  ┊32┊  Settings: { screen: Settings },
 ┊57┊33┊});
 ┊58┊34┊
 ┊59┊35┊const AppNavigator = StackNavigator({
```
```diff
@@ -78,6 +54,27 @@
 ┊78┊54┊export const navigationReducer = (state = initialNavState, action) => {
 ┊79┊55┊  let nextState;
 ┊80┊56┊  switch (action.type) {
+┊  ┊57┊    case REHYDRATE:
+┊  ┊58┊      // convert persisted data to Immutable and confirm rehydration
+┊  ┊59┊      if (!action.payload.auth || !action.payload.auth.jwt) {
+┊  ┊60┊        const { routes, index } = state;
+┊  ┊61┊        if (routes[index].routeName !== 'Signin') {
+┊  ┊62┊          nextState = AppNavigator.router.getStateForAction(
+┊  ┊63┊            NavigationActions.navigate({ routeName: 'Signin' }),
+┊  ┊64┊            state,
+┊  ┊65┊          );
+┊  ┊66┊        }
+┊  ┊67┊      }
+┊  ┊68┊      break;
+┊  ┊69┊    case 'LOGOUT':
+┊  ┊70┊      const { routes, index } = state;
+┊  ┊71┊      if (routes[index].routeName !== 'Signin') {
+┊  ┊72┊        nextState = AppNavigator.router.getStateForAction(
+┊  ┊73┊          NavigationActions.navigate({ routeName: 'Signin' }),
+┊  ┊74┊          state,
+┊  ┊75┊        );
+┊  ┊76┊      }
+┊  ┊77┊      break;
 ┊81┊78┊    default:
 ┊82┊79┊      nextState = AppNavigator.router.getStateForAction(action, state);
 ┊83┊80┊      break;
```

[}]: #

Though it’s typically best practice to keep reducers pure (not triggering actions directly), we’ve made an exception with `NavigationActions` in our `navigationReducer` to keep the code a little simpler in this particular case. 

Let’s run it!

![Logout Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step7-29.gif)

## Refactoring Queries and Mutations
We need to update all our client-side Queries and Mutations to match our modified Schema. We also need to update the variables we pass to these Queries and Mutations through `graphql` and attach to components.

Let’s look at the `USER_QUERY` in `Groups` and `AppWithNavigationState` for a full example:

[{]: <helper> (diffStep "7.30")

#### Step 7.30: Update userQuery with auth in Groups and Navigation

##### Changed client&#x2F;src&#x2F;navigation.js
```diff
@@ -137,13 +137,14 @@
 ┊137┊137┊  }),
 ┊138┊138┊};
 ┊139┊139┊
-┊140┊   ┊const mapStateToProps = state => ({
-┊141┊   ┊  nav: state.nav,
+┊   ┊140┊const mapStateToProps = ({ auth, nav }) => ({
+┊   ┊141┊  auth,
+┊   ┊142┊  nav,
 ┊142┊143┊});
 ┊143┊144┊
 ┊144┊145┊const userQuery = graphql(USER_QUERY, {
-┊145┊   ┊  skip: ownProps => true, // fake it -- we'll use ownProps with auth
-┊146┊   ┊  options: () => ({ variables: { id: 1 } }), // fake the user for now
+┊   ┊146┊  skip: ownProps => !ownProps.auth || !ownProps.auth.jwt,
+┊   ┊147┊  options: ownProps => ({ variables: { id: ownProps.auth.id } }),
 ┊147┊148┊  props: ({ data: { loading, user, subscribeToMore } }) => ({
 ┊148┊149┊    loading,
 ┊149┊150┊    user,
```

##### Changed client&#x2F;src&#x2F;screens&#x2F;groups.screen.js
```diff
@@ -10,9 +10,10 @@
 ┊10┊10┊  TouchableHighlight,
 ┊11┊11┊  View,
 ┊12┊12┊} from 'react-native';
-┊13┊  ┊import { graphql } from 'react-apollo';
+┊  ┊13┊import { graphql, compose } from 'react-apollo';
 ┊14┊14┊import moment from 'moment';
 ┊15┊15┊import Icon from 'react-native-vector-icons/FontAwesome';
+┊  ┊16┊import { connect } from 'react-redux';
 ┊16┊17┊
 ┊17┊18┊import { USER_QUERY } from '../graphql/user.query';
 ┊18┊19┊
```
```diff
@@ -95,9 +96,6 @@
 ┊ 95┊ 96┊  onPress: PropTypes.func.isRequired,
 ┊ 96┊ 97┊};
 ┊ 97┊ 98┊
-┊ 98┊   ┊// we'll fake signin for now
-┊ 99┊   ┊let IS_SIGNED_IN = false;
-┊100┊   ┊
 ┊101┊ 99┊class Group extends Component {
 ┊102┊100┊  constructor(props) {
 ┊103┊101┊    super(props);
```
```diff
@@ -167,16 +165,6 @@
 ┊167┊165┊    this.onRefresh = this.onRefresh.bind(this);
 ┊168┊166┊  }
 ┊169┊167┊
-┊170┊   ┊  componentDidMount() {
-┊171┊   ┊    if (!IS_SIGNED_IN) {
-┊172┊   ┊      IS_SIGNED_IN = true;
-┊173┊   ┊
-┊174┊   ┊      const { navigate } = this.props.navigation;
-┊175┊   ┊
-┊176┊   ┊      navigate('Signin');
-┊177┊   ┊    }
-┊178┊   ┊  }
-┊179┊   ┊
 ┊180┊168┊  onRefresh() {
 ┊181┊169┊    this.props.refetch();
 ┊182┊170┊    // faking unauthorized status
```
```diff
@@ -252,11 +240,18 @@
 ┊252┊240┊};
 ┊253┊241┊
 ┊254┊242┊const userQuery = graphql(USER_QUERY, {
-┊255┊   ┊  skip: ownProps => true, // fake it -- we'll use ownProps with auth
-┊256┊   ┊  options: () => ({ variables: { id: 1 } }), // fake the user for now
+┊   ┊243┊  skip: ownProps => !ownProps.auth || !ownProps.auth.jwt,
+┊   ┊244┊  options: ownProps => ({ variables: { id: ownProps.auth.id } }),
 ┊257┊245┊  props: ({ data: { loading, networkStatus, refetch, user } }) => ({
 ┊258┊246┊    loading, networkStatus, refetch, user,
 ┊259┊247┊  }),
 ┊260┊248┊});
 ┊261┊249┊
-┊262┊   ┊export default userQuery(Groups);
+┊   ┊250┊const mapStateToProps = ({ auth }) => ({
+┊   ┊251┊  auth,
+┊   ┊252┊});
+┊   ┊253┊
+┊   ┊254┊export default compose(
+┊   ┊255┊  connect(mapStateToProps),
+┊   ┊256┊  userQuery,
+┊   ┊257┊)(Groups);
```

[}]: #

1. We use `connect(mapStateToProps)` to attach `auth` from Redux to our component
2. We modify the `userQuery` options to pass `ownProps.auth.id` instead of the `1` placeholder
3. We change `skip` to use `ownProps.auth.jwt` to determine whether to run `userQuery`

We'll also have to make similar changes in `Messages`:

[{]: <helper> (diffStep 7.31)

#### Step 7.31: Update Messages Screen and createMessage with auth

##### Changed client&#x2F;src&#x2F;graphql&#x2F;create-message.mutation.js
```diff
@@ -3,8 +3,8 @@
 ┊ 3┊ 3┊import MESSAGE_FRAGMENT from './message.fragment';
 ┊ 4┊ 4┊
 ┊ 5┊ 5┊const CREATE_MESSAGE_MUTATION = gql`
-┊ 6┊  ┊  mutation createMessage($text: String!, $userId: Int!, $groupId: Int!) {
-┊ 7┊  ┊    createMessage(text: $text, userId: $userId, groupId: $groupId) {
+┊  ┊ 6┊  mutation createMessage($text: String!, $groupId: Int!) {
+┊  ┊ 7┊    createMessage(text: $text, groupId: $groupId) {
 ┊ 8┊ 8┊      ... MessageFragment
 ┊ 9┊ 9┊    }
 ┊10┊10┊  }
```

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -13,6 +13,7 @@
 ┊13┊13┊import { graphql, compose } from 'react-apollo';
 ┊14┊14┊import ReversedFlatList from 'react-native-reversed-flat-list';
 ┊15┊15┊import update from 'immutability-helper';
+┊  ┊16┊import { connect } from 'react-redux';
 ┊16┊17┊
 ┊17┊18┊import Message from '../components/message.component';
 ┊18┊19┊import MessageInput from '../components/message-input.component';
```
```diff
@@ -142,7 +143,6 @@
 ┊142┊143┊  send(text) {
 ┊143┊144┊    this.props.createMessage({
 ┊144┊145┊      groupId: this.props.navigation.state.params.groupId,
-┊145┊   ┊      userId: 1, // faking the user for now
 ┊146┊146┊      text,
 ┊147┊147┊    }).then(() => {
 ┊148┊148┊      this.flatList.scrollToBottom({ animated: true });
```
```diff
@@ -154,7 +154,7 @@
 ┊154┊154┊  renderItem = ({ item: message }) => (
 ┊155┊155┊    <Message
 ┊156┊156┊      color={this.state.usernameColors[message.from.username]}
-┊157┊   ┊      isCurrentUser={message.from.id === 1} // for now until we implement auth
+┊   ┊157┊      isCurrentUser={message.from.id === this.props.auth.id}
 ┊158┊158┊      message={message}
 ┊159┊159┊    />
 ┊160┊160┊  )
```
```diff
@@ -193,6 +193,10 @@
 ┊193┊193┊}
 ┊194┊194┊
 ┊195┊195┊Messages.propTypes = {
+┊   ┊196┊  auth: PropTypes.shape({
+┊   ┊197┊    id: PropTypes.number,
+┊   ┊198┊    username: PropTypes.string,
+┊   ┊199┊  }),
 ┊196┊200┊  createMessage: PropTypes.func,
 ┊197┊201┊  navigation: PropTypes.shape({
 ┊198┊202┊    navigate: PropTypes.func,
```
```diff
@@ -249,10 +253,10 @@
 ┊249┊253┊});
 ┊250┊254┊
 ┊251┊255┊const createMessageMutation = graphql(CREATE_MESSAGE_MUTATION, {
-┊252┊   ┊  props: ({ mutate }) => ({
-┊253┊   ┊    createMessage: ({ text, userId, groupId }) =>
+┊   ┊256┊  props: ({ ownProps, mutate }) => ({
+┊   ┊257┊    createMessage: ({ text, groupId }) =>
 ┊254┊258┊      mutate({
-┊255┊   ┊        variables: { text, userId, groupId },
+┊   ┊259┊        variables: { text, groupId },
 ┊256┊260┊        optimisticResponse: {
 ┊257┊261┊          __typename: 'Mutation',
 ┊258┊262┊          createMessage: {
```
```diff
@@ -262,8 +266,8 @@
 ┊262┊266┊            createdAt: new Date().toISOString(), // the time is now!
 ┊263┊267┊            from: {
 ┊264┊268┊              __typename: 'User',
-┊265┊   ┊              id: 1, // still faking the user
-┊266┊   ┊              username: 'Justyn.Kautzer', // still faking the user
+┊   ┊269┊              id: ownProps.auth.id,
+┊   ┊270┊              username: ownProps.auth.username,
 ┊267┊271┊            },
 ┊268┊272┊            to: {
 ┊269┊273┊              __typename: 'Group',
```
```diff
@@ -305,7 +309,12 @@
 ┊305┊309┊  }),
 ┊306┊310┊});
 ┊307┊311┊
+┊   ┊312┊const mapStateToProps = ({ auth }) => ({
+┊   ┊313┊  auth,
+┊   ┊314┊});
+┊   ┊315┊
 ┊308┊316┊export default compose(
+┊   ┊317┊  connect(mapStateToProps),
 ┊309┊318┊  groupQuery,
 ┊310┊319┊  createMessageMutation,
 ┊311┊320┊)(Messages);
```

[}]: #

We need to make similar changes in every other one of our components before we’re bug free. Here are all the major changes:

[{]: <helper> (diffStep 7.32)

#### Step 7.32: Update Groups flow with auth

##### Changed client&#x2F;src&#x2F;graphql&#x2F;create-group.mutation.js
```diff
@@ -3,8 +3,8 @@
 ┊ 3┊ 3┊import MESSAGE_FRAGMENT from './message.fragment';
 ┊ 4┊ 4┊
 ┊ 5┊ 5┊const CREATE_GROUP_MUTATION = gql`
-┊ 6┊  ┊  mutation createGroup($name: String!, $userIds: [Int!], $userId: Int!) {
-┊ 7┊  ┊    createGroup(name: $name, userIds: $userIds, userId: $userId) {
+┊  ┊ 6┊  mutation createGroup($name: String!, $userIds: [Int!]) {
+┊  ┊ 7┊    createGroup(name: $name, userIds: $userIds) {
 ┊ 8┊ 8┊      id
 ┊ 9┊ 9┊      name
 ┊10┊10┊      users {
```

##### Changed client&#x2F;src&#x2F;graphql&#x2F;leave-group.mutation.js
```diff
@@ -1,8 +1,8 @@
 ┊1┊1┊import gql from 'graphql-tag';
 ┊2┊2┊
 ┊3┊3┊const LEAVE_GROUP_MUTATION = gql`
-┊4┊ ┊  mutation leaveGroup($id: Int!, $userId: Int!) {
-┊5┊ ┊    leaveGroup(id: $id, userId: $userId) {
+┊ ┊4┊  mutation leaveGroup($id: Int!) {
+┊ ┊5┊    leaveGroup(id: $id) {
 ┊6┊6┊      id
 ┊7┊7┊    }
 ┊8┊8┊  }
```

##### Changed client&#x2F;src&#x2F;screens&#x2F;finalize-group.screen.js
```diff
@@ -14,6 +14,7 @@
 ┊14┊14┊import { graphql, compose } from 'react-apollo';
 ┊15┊15┊import { NavigationActions } from 'react-navigation';
 ┊16┊16┊import update from 'immutability-helper';
+┊  ┊17┊import { connect } from 'react-redux';
 ┊17┊18┊
 ┊18┊19┊import { USER_QUERY } from '../graphql/user.query';
 ┊19┊20┊import CREATE_GROUP_MUTATION from '../graphql/create-group.mutation';
```
```diff
@@ -151,7 +152,6 @@
 ┊151┊152┊
 ┊152┊153┊    createGroup({
 ┊153┊154┊      name: this.state.name,
-┊154┊   ┊      userId: 1, // fake user for now
 ┊155┊155┊      userIds: _.map(this.state.selected, 'id'),
 ┊156┊156┊    }).then((res) => {
 ┊157┊157┊      this.props.navigation.dispatch(goToNewGroup(res.data.createGroup));
```
```diff
@@ -230,13 +230,13 @@
 ┊230┊230┊};
 ┊231┊231┊
 ┊232┊232┊const createGroupMutation = graphql(CREATE_GROUP_MUTATION, {
-┊233┊   ┊  props: ({ mutate }) => ({
-┊234┊   ┊    createGroup: ({ name, userIds, userId }) =>
+┊   ┊233┊  props: ({ ownProps, mutate }) => ({
+┊   ┊234┊    createGroup: ({ name, userIds }) =>
 ┊235┊235┊      mutate({
-┊236┊   ┊        variables: { name, userIds, userId },
+┊   ┊236┊        variables: { name, userIds },
 ┊237┊237┊        update: (store, { data: { createGroup } }) => {
 ┊238┊238┊          // Read the data from our cache for this query.
-┊239┊   ┊          const data = store.readQuery({ query: USER_QUERY, variables: { id: userId } });
+┊   ┊239┊          const data = store.readQuery({ query: USER_QUERY, variables: { id: ownProps.auth.id } });
 ┊240┊240┊
 ┊241┊241┊          if (isDuplicateGroup(createGroup, data.user.groups)) {
 ┊242┊242┊            return;
```
```diff
@@ -248,7 +248,7 @@
 ┊248┊248┊          // Write our data back to the cache.
 ┊249┊249┊          store.writeQuery({
 ┊250┊250┊            query: USER_QUERY,
-┊251┊   ┊            variables: { id: userId },
+┊   ┊251┊            variables: { id: ownProps.auth.id },
 ┊252┊252┊            data,
 ┊253┊253┊          });
 ┊254┊254┊        },
```
```diff
@@ -267,7 +267,12 @@
 ┊267┊267┊  }),
 ┊268┊268┊});
 ┊269┊269┊
+┊   ┊270┊const mapStateToProps = ({ auth }) => ({
+┊   ┊271┊  auth,
+┊   ┊272┊});
+┊   ┊273┊
 ┊270┊274┊export default compose(
+┊   ┊275┊  connect(mapStateToProps),
 ┊271┊276┊  userQuery,
 ┊272┊277┊  createGroupMutation,
 ┊273┊278┊)(FinalizeGroup);
```

##### Changed client&#x2F;src&#x2F;screens&#x2F;group-details.screen.js
```diff
@@ -13,6 +13,7 @@
 ┊13┊13┊} from 'react-native';
 ┊14┊14┊import { graphql, compose } from 'react-apollo';
 ┊15┊15┊import { NavigationActions } from 'react-navigation';
+┊  ┊16┊import { connect } from 'react-redux';
 ┊16┊17┊
 ┊17┊18┊import GROUP_QUERY from '../graphql/group.query';
 ┊18┊19┊import USER_QUERY from '../graphql/user.query';
```
```diff
@@ -110,8 +111,7 @@
 ┊110┊111┊  leaveGroup() {
 ┊111┊112┊    this.props.leaveGroup({
 ┊112┊113┊      id: this.props.navigation.state.params.id,
-┊113┊   ┊      userId: 1,
-┊114┊   ┊    }) // fake user for now
+┊   ┊114┊    })
 ┊115┊115┊      .then(() => {
 ┊116┊116┊        this.props.navigation.dispatch(resetAction);
 ┊117┊117┊      })
```
```diff
@@ -219,7 +219,7 @@
 ┊219┊219┊        variables: { id },
 ┊220┊220┊        update: (store, { data: { deleteGroup } }) => {
 ┊221┊221┊          // Read the data from our cache for this query.
-┊222┊   ┊          const data = store.readQuery({ query: USER_QUERY, variables: { id: 1 } }); // fake for now
+┊   ┊222┊          const data = store.readQuery({ query: USER_QUERY, variables: { id: ownProps.auth.id } });
 ┊223┊223┊
 ┊224┊224┊          // Add our message from the mutation to the end.
 ┊225┊225┊          data.user.groups = data.user.groups.filter(g => deleteGroup.id !== g.id);
```
```diff
@@ -227,7 +227,7 @@
 ┊227┊227┊          // Write our data back to the cache.
 ┊228┊228┊          store.writeQuery({
 ┊229┊229┊            query: USER_QUERY,
-┊230┊   ┊            variables: { id: 1 }, // fake for now
+┊   ┊230┊            variables: { id: ownProps.auth.id },
 ┊231┊231┊            data,
 ┊232┊232┊          });
 ┊233┊233┊        },
```
```diff
@@ -237,12 +237,12 @@
 ┊237┊237┊
 ┊238┊238┊const leaveGroupMutation = graphql(LEAVE_GROUP_MUTATION, {
 ┊239┊239┊  props: ({ ownProps, mutate }) => ({
-┊240┊   ┊    leaveGroup: ({ id, userId }) =>
+┊   ┊240┊    leaveGroup: ({ id }) =>
 ┊241┊241┊      mutate({
-┊242┊   ┊        variables: { id, userId },
+┊   ┊242┊        variables: { id },
 ┊243┊243┊        update: (store, { data: { leaveGroup } }) => {
 ┊244┊244┊          // Read the data from our cache for this query.
-┊245┊   ┊          const data = store.readQuery({ query: USER_QUERY, variables: { id: 1 } }); // fake for now
+┊   ┊245┊          const data = store.readQuery({ query: USER_QUERY, variables: { id: ownProps.auth.id } });
 ┊246┊246┊
 ┊247┊247┊          // Add our message from the mutation to the end.
 ┊248┊248┊          data.user.groups = data.user.groups.filter(g => leaveGroup.id !== g.id);
```
```diff
@@ -250,7 +250,7 @@
 ┊250┊250┊          // Write our data back to the cache.
 ┊251┊251┊          store.writeQuery({
 ┊252┊252┊            query: USER_QUERY,
-┊253┊   ┊            variables: { id: 1 }, // fake for now
+┊   ┊253┊            variables: { id: ownProps.auth.id },
 ┊254┊254┊            data,
 ┊255┊255┊          });
 ┊256┊256┊        },
```
```diff
@@ -258,7 +258,12 @@
 ┊258┊258┊  }),
 ┊259┊259┊});
 ┊260┊260┊
+┊   ┊261┊const mapStateToProps = ({ auth }) => ({
+┊   ┊262┊  auth,
+┊   ┊263┊});
+┊   ┊264┊
 ┊261┊265┊export default compose(
+┊   ┊266┊  connect(mapStateToProps),
 ┊262┊267┊  groupQuery,
 ┊263┊268┊  deleteGroupMutation,
 ┊264┊269┊  leaveGroupMutation,
```

##### Changed client&#x2F;src&#x2F;screens&#x2F;new-group.screen.js
```diff
@@ -13,6 +13,7 @@
 ┊13┊13┊import AlphabetListView from 'react-native-alphabetlistview';
 ┊14┊14┊import update from 'immutability-helper';
 ┊15┊15┊import Icon from 'react-native-vector-icons/FontAwesome';
+┊  ┊16┊import { connect } from 'react-redux';
 ┊16┊17┊
 ┊17┊18┊import SelectedUserList from '../components/selected-user-list.component';
 ┊18┊19┊import USER_QUERY from '../graphql/user.query';
```
```diff
@@ -309,12 +310,17 @@
 ┊309┊310┊};
 ┊310┊311┊
 ┊311┊312┊const userQuery = graphql(USER_QUERY, {
-┊312┊   ┊  options: (ownProps) => ({ variables: { id: 1 } }), // fake for now
+┊   ┊313┊  options: ownProps => ({ variables: { id: ownProps.auth.id } }),
 ┊313┊314┊  props: ({ data: { loading, user } }) => ({
 ┊314┊315┊    loading, user,
 ┊315┊316┊  }),
 ┊316┊317┊});
 ┊317┊318┊
+┊   ┊319┊const mapStateToProps = ({ auth }) => ({
+┊   ┊320┊  auth,
+┊   ┊321┊});
+┊   ┊322┊
 ┊318┊323┊export default compose(
+┊   ┊324┊  connect(mapStateToProps),
 ┊319┊325┊  userQuery,
 ┊320┊326┊)(NewGroup);
```

[}]: #

When everything is said and done, we should have a beautifully running Chatty app 📱‼️‼️ 

![Chatty Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step7-32.gif)

# 🎉 CONGRATULATIONS!!! 🎉
We made it! We made a secure, real-time chat app with React Native and GraphQL. How cool is that?! More importantly, we now have the skills and knowhow to make pretty much anything we want with some of the best tools out there.

I hope this series has been at least a little helpful in furthering your growth as a developer. I’m really stoked and humbled at the reception it has been getting, and I want to continue to do everything I can to make it the best it can be.

With that in mind, if you have any suggestions for making this series better, please leave your feedback!

[{]: <helper> (navStep)

| [< Previous Step](step6.md) | [Next Step >](step8.md) |
|:--------------------------------|--------------------------------:|

[}]: #
