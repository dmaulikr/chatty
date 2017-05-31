# Step 4: GraphQL Mutations

This is the fourth blog in a multipart series where we will be building Chatty, a WhatsApp clone, using [React Native](https://facebook.github.io/react-native/) and [Apollo](http://dev.apollodata.com/).

Here’s what we will accomplish in this tutorial:
* Design **GraphQL Mutations** and add them to the GraphQL Schemas on our server
* Modify the layout on our React Native client to let users send Messages
* Build GraphQL Mutations on our RN client and connect them to components using `react-apollo`
* Add **Optimistic UI** to our GraphQL Mutations so our RN client updates as soon as the Message is sent — even before the server sends a response!

***YOUR CHALLENGE***
1. Add GraphQL Mutations on our server for creating, modifying, and deleting Groups
2. Add new Screens to our React Native app for creating, modifying, and deleting Groups
3. Build GraphQL Queries and Mutations for our new Screens and connect them using `react-apollo`

# Adding GraphQL Mutations on the Server
While GraphQL Queries let us fetch data from our server, GraphQL Mutations allow us to modify our server held data.

To add a mutation to our GraphQL endpoint, we start by defining the mutation in our GraphQL Schema much like we did with queries. We’ll define a `createMessage` mutation that will enable users to send a new message to a Group:
```
type Mutation {
  # create a new message 
  # text is the message text
  # userId is the id of the user sending the message
  # groupId is the id of the group receiving the message
  createMessage(text: String!, userId: Int!, groupId: Int!): Message
}
```
GraphQL Mutations are written nearly identically like GraphQL Queries. For now, we will require a `userId` parameter to identify who is creating the `Message`, but we won’t need this field once we implement authentication in a future tutorial.

Let’s update our Schema in `server/data/schema.js` to include the mutation:

[{]: <helper> (diffStep 4.1)

#### Step 4.1: Add Mutations to Schema

##### Changed server&#x2F;data&#x2F;schema.js
```diff
@@ -42,8 +42,16 @@
 ┊42┊42┊    group(id: Int!): Group
 ┊43┊43┊  }
 ┊44┊44┊
+┊  ┊45┊  type Mutation {
+┊  ┊46┊    # send a message to a group
+┊  ┊47┊    createMessage(
+┊  ┊48┊      text: String!, userId: Int!, groupId: Int!
+┊  ┊49┊    ): Message
+┊  ┊50┊  }
+┊  ┊51┊  
 ┊45┊52┊  schema {
 ┊46┊53┊    query: Query
+┊  ┊54┊    mutation: Mutation
 ┊47┊55┊  }
 ┊48┊56┊`];
```

[}]: #

Finally, we need to modify our resolvers to handle our new mutation. We’ll modify `server/data/resolvers.js` as follows:

[{]: <helper> (diffStep 4.2)

#### Step 4.2: Add Mutations to Resolvers

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -18,6 +18,15 @@
 ┊18┊18┊      return User.findOne({ where: args });
 ┊19┊19┊    },
 ┊20┊20┊  },
+┊  ┊21┊  Mutation: {
+┊  ┊22┊    createMessage(_, { text, userId, groupId }) {
+┊  ┊23┊      return Message.create({
+┊  ┊24┊        userId,
+┊  ┊25┊        text,
+┊  ┊26┊        groupId,
+┊  ┊27┊      });
+┊  ┊28┊    },
+┊  ┊29┊  },
 ┊21┊30┊  Group: {
 ┊22┊31┊    users(group) {
 ┊23┊32┊      return group.getUsers();
```

[}]: #

That’s it! When a client uses `createMessage`, the resolver will use the `Message `model passed by our connector and call `Message.create` with arguments from the mutation. The `Message.create` function returns a Promise that will resolve with the newly created `Message`.

We can easily test our newly minted `createMessage` mutation in GraphIQL to make sure everything works: ![Create Message Img](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step4-2.png)

# Designing the Input
Wow, that was way faster than when we added queries! All the heavy lifting we did in the first 3 parts of this series is starting to pay off….

Now that our server allows clients to create messages, we can build that functionality into our React Native client. First, we’ll start by creating a new component `MessageInput` where our users will be able to input their messages.

For this component, let's use **cool icons**. [`react-native-vector-icons`](https://github.com/oblador/react-native-vector-icons) is the goto package for adding icons to React Native. Please follow the instructions in the [`react-native-vector-icons` README](https://github.com/oblador/react-native-vector-icons) before moving onto the next step.

```
# make sure you're adding this package in the client folder!!!
cd client

yarn add react-native-vector-icons
react-native link
# this is not enough to install icons!!! PLEASE FOLLOW THE INSTRUCTIONS IN THE README TO PROPERLY INSTALL ICONS!
```
After completing the steps in the README to install icons, we can start putting together the `MessageInput` component in a new file `client/src/components/message-input.component.js`:

[{]: <helper> (diffStep 4.3 files="client/src/components/message-input.component.js")

#### Step 4.3: Create MessageInput

##### Added client&#x2F;src&#x2F;components&#x2F;message-input.component.js
```diff
@@ -0,0 +1,94 @@
+┊  ┊ 1┊import React, { Component, PropTypes } from 'react';
+┊  ┊ 2┊import {
+┊  ┊ 3┊  StyleSheet,
+┊  ┊ 4┊  TextInput,
+┊  ┊ 5┊  View,
+┊  ┊ 6┊} from 'react-native';
+┊  ┊ 7┊
+┊  ┊ 8┊import Icon from 'react-native-vector-icons/FontAwesome';
+┊  ┊ 9┊
+┊  ┊10┊const styles = StyleSheet.create({
+┊  ┊11┊  container: {
+┊  ┊12┊    alignSelf: 'flex-end',
+┊  ┊13┊    backgroundColor: '#f5f1ee',
+┊  ┊14┊    borderColor: '#dbdbdb',
+┊  ┊15┊    borderTopWidth: 1,
+┊  ┊16┊    flexDirection: 'row',
+┊  ┊17┊  },
+┊  ┊18┊  inputContainer: {
+┊  ┊19┊    flex: 1,
+┊  ┊20┊    paddingHorizontal: 12,
+┊  ┊21┊    paddingVertical: 6,
+┊  ┊22┊  },
+┊  ┊23┊  input: {
+┊  ┊24┊    backgroundColor: 'white',
+┊  ┊25┊    borderColor: '#dbdbdb',
+┊  ┊26┊    borderRadius: 15,
+┊  ┊27┊    borderWidth: 1,
+┊  ┊28┊    color: 'black',
+┊  ┊29┊    height: 32,
+┊  ┊30┊    paddingHorizontal: 8,
+┊  ┊31┊  },
+┊  ┊32┊  sendButtonContainer: {
+┊  ┊33┊    paddingRight: 12,
+┊  ┊34┊    paddingVertical: 6,
+┊  ┊35┊  },
+┊  ┊36┊  sendButton: {
+┊  ┊37┊    height: 32,
+┊  ┊38┊    width: 32,
+┊  ┊39┊  },
+┊  ┊40┊  iconStyle: {
+┊  ┊41┊    marginRight: 0, // default is 12
+┊  ┊42┊  },
+┊  ┊43┊});
+┊  ┊44┊
+┊  ┊45┊const sendButton = send => (
+┊  ┊46┊  <Icon.Button
+┊  ┊47┊    backgroundColor={'blue'}
+┊  ┊48┊    borderRadius={16}
+┊  ┊49┊    color={'white'}
+┊  ┊50┊    iconStyle={styles.iconStyle}
+┊  ┊51┊    name="send"
+┊  ┊52┊    onPress={send}
+┊  ┊53┊    size={16}
+┊  ┊54┊    style={styles.sendButton}
+┊  ┊55┊  />
+┊  ┊56┊);
+┊  ┊57┊
+┊  ┊58┊class MessageInput extends Component {
+┊  ┊59┊  constructor(props) {
+┊  ┊60┊    super(props);
+┊  ┊61┊    this.state = {};
+┊  ┊62┊    this.send = this.send.bind(this);
+┊  ┊63┊  }
+┊  ┊64┊
+┊  ┊65┊  send() {
+┊  ┊66┊    this.props.send(this.state.text);
+┊  ┊67┊    this.textInput.clear();
+┊  ┊68┊    this.textInput.blur();
+┊  ┊69┊  }
+┊  ┊70┊
+┊  ┊71┊  render() {
+┊  ┊72┊    return (
+┊  ┊73┊      <View style={styles.container}>
+┊  ┊74┊        <View style={styles.inputContainer}>
+┊  ┊75┊          <TextInput
+┊  ┊76┊            ref={(ref) => { this.textInput = ref; }}
+┊  ┊77┊            onChangeText={text => this.setState({ text })}
+┊  ┊78┊            style={styles.input}
+┊  ┊79┊            placeholder="Type your message here!"
+┊  ┊80┊          />
+┊  ┊81┊        </View>
+┊  ┊82┊        <View style={styles.sendButtonContainer}>
+┊  ┊83┊          {sendButton(this.send)}
+┊  ┊84┊        </View>
+┊  ┊85┊      </View>
+┊  ┊86┊    );
+┊  ┊87┊  }
+┊  ┊88┊}
+┊  ┊89┊
+┊  ┊90┊MessageInput.propTypes = {
+┊  ┊91┊  send: PropTypes.func.isRequired,
+┊  ┊92┊};
+┊  ┊93┊
+┊  ┊94┊export default MessageInput;
```

[}]: #

Our `MessageInput` component is a `View` that wraps a controlled `TextInput` and an [`Icon.Button`](https://github.com/oblador/react-native-vector-icons#iconbutton-component). When the button is pressed, `props.send` will be called with the current state of the `TextInput` text and then the `TextInput` will clear. We’ve also added some styling to keep everything looking snazzy.

Let’s add `MessageInput` to the bottom of the `Messages` screen and create a placeholder `send` function:

[{]: <helper> (diffStep 4.4)

#### Step 4.4: Add MessageInput to Messages

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -10,6 +10,7 @@
 ┊10┊10┊import { graphql, compose } from 'react-apollo';
 ┊11┊11┊
 ┊12┊12┊import Message from '../components/message.component';
+┊  ┊13┊import MessageInput from '../components/message-input.component';
 ┊13┊14┊import GROUP_QUERY from '../graphql/group.query';
 ┊14┊15┊
 ┊15┊16┊const styles = StyleSheet.create({
```
```diff
@@ -37,6 +38,8 @@
 ┊37┊38┊    this.state = {
 ┊38┊39┊      usernameColors: {},
 ┊39┊40┊    };
+┊  ┊41┊
+┊  ┊42┊    this.send = this.send.bind(this);
 ┊40┊43┊  }
 ┊41┊44┊
 ┊42┊45┊  componentWillReceiveProps(nextProps) {
```
```diff
@@ -56,6 +59,11 @@
 ┊56┊59┊    }
 ┊57┊60┊  }
 ┊58┊61┊
+┊  ┊62┊  send(text) {
+┊  ┊63┊    // TODO: send the message
+┊  ┊64┊    console.log(`sending message: ${text}`);
+┊  ┊65┊  }
+┊  ┊66┊
 ┊59┊67┊  keyExtractor = item => item.id;
 ┊60┊68┊
 ┊61┊69┊  renderItem = ({ item: message }) => (
```
```diff
@@ -86,6 +94,7 @@
 ┊ 86┊ 94┊          keyExtractor={this.keyExtractor}
 ┊ 87┊ 95┊          renderItem={this.renderItem}
 ┊ 88┊ 96┊        />
+┊   ┊ 97┊        <MessageInput send={this.send} />
 ┊ 89┊ 98┊      </View>
 ┊ 90┊ 99┊    );
 ┊ 91┊100┊  }
```

[}]: #

It should look like this: ![Message Input Image](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step4-4.png)

But **don’t be fooled by your simulator!** This UI will break on a phone because of the keyboard: ![Broken Input Image](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step4-4-2.png)

You are not the first person to groan over this issue. For you and the many groaners out there, the wonderful devs at Facebook have your back. [`KeyboardAvoidingView`](https://facebook.github.io/react-native/docs/keyboardavoidingview.html) to the rescue!

[{]: <helper> (diffStep 4.5)

#### Step 4.5: Add KeyboardAvoidingView

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -1,6 +1,7 @@
 ┊1┊1┊import {
 ┊2┊2┊  ActivityIndicator,
 ┊3┊3┊  FlatList,
+┊ ┊4┊  KeyboardAvoidingView,
 ┊4┊5┊  StyleSheet,
 ┊5┊6┊  View,
 ┊6┊7┊} from 'react-native';
```
```diff
@@ -88,14 +89,19 @@
 ┊ 88┊ 89┊
 ┊ 89┊ 90┊    // render list of messages for group
 ┊ 90┊ 91┊    return (
-┊ 91┊   ┊      <View style={styles.container}>
+┊   ┊ 92┊      <KeyboardAvoidingView
+┊   ┊ 93┊        behavior={'position'}
+┊   ┊ 94┊        contentContainerStyle={styles.container}
+┊   ┊ 95┊        keyboardVerticalOffset={64}
+┊   ┊ 96┊        style={styles.container}
+┊   ┊ 97┊      >
 ┊ 92┊ 98┊        <FlatList
 ┊ 93┊ 99┊          data={group.messages.slice().reverse()}
 ┊ 94┊100┊          keyExtractor={this.keyExtractor}
 ┊ 95┊101┊          renderItem={this.renderItem}
 ┊ 96┊102┊        />
 ┊ 97┊103┊        <MessageInput send={this.send} />
-┊ 98┊   ┊      </View>
+┊   ┊104┊      </KeyboardAvoidingView>
 ┊ 99┊105┊    );
 ┊100┊106┊  }
 ┊101┊107┊}
```

[}]: #

![Fixed Input Image](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step4-5.png)

Our layout looks ready. Now let’s make it work!

# Adding GraphQL Mutations on the Client
Let’s start by defining our GraphQL Mutation like we would using GraphIQL:
```
mutation createMessage($text: String!, $userId: Int!, $groupId: Int!) {
  createMessage(text: $text, userId: $userId, groupId: $groupId) {
    id
    from {
      id
      username
    }
    createdAt
    text
  }
}
```
That looks fine, but notice the `Message` fields we want to see returned look exactly like the `Message` fields we are using for `GROUP_QUERY`:
```
query group($groupId: Int!) {
  group(id: $groupId) {
    id
    name
    users {
      id
      username
    }
    messages {
      id
      from {
        id
        username
      }
      createdAt
      text
    }
  }
}
```
GraphQL allows us to reuse pieces of queries and mutations with [**Fragments**](http://graphql.org/learn/queries/#fragments). We can factor out this common set of fields into a `MessageFragment` that looks like this:

[{]: <helper> (diffStep 4.6)

#### Step 4.6: Create MessageFragment

##### Added client&#x2F;src&#x2F;graphql&#x2F;message.fragment.js
```diff
@@ -0,0 +1,18 @@
+┊  ┊ 1┊import gql from 'graphql-tag';
+┊  ┊ 2┊
+┊  ┊ 3┊const MESSAGE_FRAGMENT = gql`
+┊  ┊ 4┊  fragment MessageFragment on Message {
+┊  ┊ 5┊    id
+┊  ┊ 6┊    to {
+┊  ┊ 7┊      id
+┊  ┊ 8┊    }
+┊  ┊ 9┊    from {
+┊  ┊10┊      id
+┊  ┊11┊      username
+┊  ┊12┊    }
+┊  ┊13┊    createdAt
+┊  ┊14┊    text
+┊  ┊15┊  }
+┊  ┊16┊`;
+┊  ┊17┊
+┊  ┊18┊export default MESSAGE_FRAGMENT;
```

[}]: #

Now we can apply `MESSAGE_FRAGMENT` to `GROUP_QUERY` by changing our code as follows:

[{]: <helper> (diffStep 4.7)

#### Step 4.7: Add MessageFragment to Group Query

##### Changed client&#x2F;src&#x2F;graphql&#x2F;group.query.js
```diff
@@ -1,5 +1,7 @@
 ┊1┊1┊import gql from 'graphql-tag';
 ┊2┊2┊
+┊ ┊3┊import MESSAGE_FRAGMENT from './message.fragment';
+┊ ┊4┊
 ┊3┊5┊const GROUP_QUERY = gql`
 ┊4┊6┊  query group($groupId: Int!) {
 ┊5┊7┊    group(id: $groupId) {
```
```diff
@@ -10,16 +12,11 @@
 ┊10┊12┊        username
 ┊11┊13┊      }
 ┊12┊14┊      messages {
-┊13┊  ┊        id
-┊14┊  ┊        from {
-┊15┊  ┊          id
-┊16┊  ┊          username
-┊17┊  ┊        }
-┊18┊  ┊        createdAt
-┊19┊  ┊        text
+┊  ┊15┊        ... MessageFragment
 ┊20┊16┊      }
 ┊21┊17┊    }
 ┊22┊18┊  }
+┊  ┊19┊  ${MESSAGE_FRAGMENT}
 ┊23┊20┊`;
 ┊24┊21┊
 ┊25┊22┊export default GROUP_QUERY;
```

[}]: #

Let’s also write our `createMessage` mutation using `messageFragment` in a new file `client/src/graphql/createMessage.mutation.js`:

[{]: <helper> (diffStep 4.8)

#### Step 4.8: Create CREATE_MESSAGE_MUTATION

##### Added client&#x2F;src&#x2F;graphql&#x2F;create-message.mutation.js
```diff
@@ -0,0 +1,14 @@
+┊  ┊ 1┊import gql from 'graphql-tag';
+┊  ┊ 2┊
+┊  ┊ 3┊import MESSAGE_FRAGMENT from './message.fragment';
+┊  ┊ 4┊
+┊  ┊ 5┊const CREATE_MESSAGE_MUTATION = gql`
+┊  ┊ 6┊  mutation createMessage($text: String!, $userId: Int!, $groupId: Int!) {
+┊  ┊ 7┊    createMessage(text: $text, userId: $userId, groupId: $groupId) {
+┊  ┊ 8┊      ... MessageFragment
+┊  ┊ 9┊    }
+┊  ┊10┊  }
+┊  ┊11┊  ${MESSAGE_FRAGMENT}
+┊  ┊12┊`;
+┊  ┊13┊
+┊  ┊14┊export default CREATE_MESSAGE_MUTATION;
```

[}]: #

Now all we have to do is plug our mutation into our `Messages` component using the `graphql` module from `react-apollo`. Before we connect everything, let’s see what a mutation call with the `graphql` module looks like:
```
const createMessage = graphql(CREATE_MESSAGE_MUTATION, {
  props: ({ ownProps, mutate }) => ({
    createMessage: ({ text, userId, groupId }) =>
      mutate({
        variables: { text, userId, groupId },
      }),
  }),
});
```
Just like with a GraphQL Query, we first pass our mutation to `graphql`, followed by an Object with configuration params. The `props` param accepts a function with named arguments including `ownProps` (the components current props) and `mutate`. This function should return an Object with the name of the function that we plan to call inside our component, which executes `mutate` with the variables we wish to pass. If that sounds complicated, it’s because it is. Kudos to the Meteor team for putting it together though, because it’s actually some very clever code.

At the end of the day, once you write your first mutation, it’s really mostly a matter of copy/paste and changing the names of the variables.

Okay, so let’s put it all together in `messages.component.js`:

[{]: <helper> (diffStep 4.9)

#### Step 4.9: Add CREATE_MESSAGE_MUTATION to Messages

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -13,6 +13,7 @@
 ┊13┊13┊import Message from '../components/message.component';
 ┊14┊14┊import MessageInput from '../components/message-input.component';
 ┊15┊15┊import GROUP_QUERY from '../graphql/group.query';
+┊  ┊16┊import CREATE_MESSAGE_MUTATION from '../graphql/create-message.mutation';
 ┊16┊17┊
 ┊17┊18┊const styles = StyleSheet.create({
 ┊18┊19┊  container: {
```
```diff
@@ -61,8 +62,11 @@
 ┊61┊62┊  }
 ┊62┊63┊
 ┊63┊64┊  send(text) {
-┊64┊  ┊    // TODO: send the message
-┊65┊  ┊    console.log(`sending message: ${text}`);
+┊  ┊65┊    this.props.createMessage({
+┊  ┊66┊      groupId: this.props.navigation.state.params.groupId,
+┊  ┊67┊      userId: 1, // faking the user for now
+┊  ┊68┊      text,
+┊  ┊69┊    });
 ┊66┊70┊  }
 ┊67┊71┊
 ┊68┊72┊  keyExtractor = item => item.id;
```
```diff
@@ -107,6 +111,14 @@
 ┊107┊111┊}
 ┊108┊112┊
 ┊109┊113┊Messages.propTypes = {
+┊   ┊114┊  createMessage: PropTypes.func,
+┊   ┊115┊  navigation: PropTypes.shape({
+┊   ┊116┊    state: PropTypes.shape({
+┊   ┊117┊      params: PropTypes.shape({
+┊   ┊118┊        groupId: PropTypes.number,
+┊   ┊119┊      }),
+┊   ┊120┊    }),
+┊   ┊121┊  }),
 ┊110┊122┊  group: PropTypes.shape({
 ┊111┊123┊    messages: PropTypes.array,
 ┊112┊124┊    users: PropTypes.array,
```
```diff
@@ -125,6 +137,16 @@
 ┊125┊137┊  }),
 ┊126┊138┊});
 ┊127┊139┊
+┊   ┊140┊const createMessageMutation = graphql(CREATE_MESSAGE_MUTATION, {
+┊   ┊141┊  props: ({ mutate }) => ({
+┊   ┊142┊    createMessage: ({ text, userId, groupId }) =>
+┊   ┊143┊      mutate({
+┊   ┊144┊        variables: { text, userId, groupId },
+┊   ┊145┊      }),
+┊   ┊146┊  }),
+┊   ┊147┊});
+┊   ┊148┊
 ┊128┊149┊export default compose(
 ┊129┊150┊  groupQuery,
+┊   ┊151┊  createMessageMutation,
 ┊130┊152┊)(Messages);
```

[}]: #

By attaching `createMessage` with `compose`, we attach a `createMessage` function to the component’s `props`. We call `props.createMessage` in `send` with the required variables (we’ll keep faking the user for now). When the user presses the send button, this method will get called and the mutation should execute.

Let’s run the app and see what happens: ![Send Fail Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step4-9.gif)

What went wrong? Well technically nothing went wrong. Our mutation successfully executed, but we’re not seeing our message pop up. Why? **Running a mutation doesn’t automatically update our queries with new data!** If we were to refresh the page, we’d actually see our message. This issue only arrises when we are adding or removing data with our mutation.

To overcome this challenge, `react-apollo` lets us declare a property `update` within the argument we pass to mutate. In `update`, we specify which queries should update after the mutation executes and how the data will transform.

Our modified `createMessage` should look like this:

[{]: <helper> (diffStep "4.10")

#### Step 4.10: Add update to mutation

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -27,6 +27,11 @@
 ┊27┊27┊  },
 ┊28┊28┊});
 ┊29┊29┊
+┊  ┊30┊function isDuplicateMessage(newMessage, existingMessages) {
+┊  ┊31┊  return newMessage.id !== null &&
+┊  ┊32┊    existingMessages.some(message => newMessage.id === message.id);
+┊  ┊33┊}
+┊  ┊34┊
 ┊30┊35┊class Messages extends Component {
 ┊31┊36┊  static navigationOptions = ({ navigation }) => {
 ┊32┊37┊    const { state } = navigation;
```
```diff
@@ -142,7 +147,33 @@
 ┊142┊147┊    createMessage: ({ text, userId, groupId }) =>
 ┊143┊148┊      mutate({
 ┊144┊149┊        variables: { text, userId, groupId },
+┊   ┊150┊        update: (store, { data: { createMessage } }) => {
+┊   ┊151┊          // Read the data from our cache for this query.
+┊   ┊152┊          const data = store.readQuery({
+┊   ┊153┊            query: GROUP_QUERY,
+┊   ┊154┊            variables: {
+┊   ┊155┊              groupId,
+┊   ┊156┊            },
+┊   ┊157┊          });
+┊   ┊158┊
+┊   ┊159┊          if (isDuplicateMessage(createMessage, data.group.messages)) {
+┊   ┊160┊            return data;
+┊   ┊161┊          }
+┊   ┊162┊
+┊   ┊163┊          // Add our message from the mutation to the end.
+┊   ┊164┊          data.group.messages.unshift(createMessage);
+┊   ┊165┊
+┊   ┊166┊          // Write our data back to the cache.
+┊   ┊167┊          store.writeQuery({
+┊   ┊168┊            query: GROUP_QUERY,
+┊   ┊169┊            variables: {
+┊   ┊170┊              groupId,
+┊   ┊171┊            },
+┊   ┊172┊            data,
+┊   ┊173┊          });
+┊   ┊174┊        },
 ┊145┊175┊      }),
+┊   ┊176┊
 ┊146┊177┊  }),
 ┊147┊178┊});
```

[}]: #

In `update`, we first retrieve the existing data for the query we want to update (`GROUP_QUERY`) along with the specific variables we passed to that query. This data comes to us from our Redux store of Apollo data. We check to see if the new `Message` returned from `createMessage` already exists (in case of race conditions down the line), and then update the previous query result by sticking the new message in front. We then use this modified data object and rewrite the results to the Apollo store with `store.writeQuery`, being sure to pass all the variables associated with our query. This will force `props` to change reference and the component to rerender. ![Fixed Send Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step4-10.gif)

# Optimistic UI
### But wait! There’s more!
`update` will currently only update the query after the mutation succeeds and a response is sent back on the server. But we don’t want to wait till the server returns data  —  we crave instant gratification! If a user with shoddy internet tried to send a message and it didn’t show up right away, they’d probably try and send the message again and again and end up sending the message multiple times… and then they’d yell at customer support!

**Optimistic UI** is our weapon for protecting customer support. We know the shape of the data we expect to receive from the server, so why not fake it until we get a response? `react-apollo` lets us accomplish this by adding an `optimisticResponse` parameter to mutate. In our case it looks like this:

[{]: <helper> (diffStep 4.11)

#### Step 4.11: Add optimisticResponse to mutation

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -147,6 +147,24 @@
 ┊147┊147┊    createMessage: ({ text, userId, groupId }) =>
 ┊148┊148┊      mutate({
 ┊149┊149┊        variables: { text, userId, groupId },
+┊   ┊150┊        optimisticResponse: {
+┊   ┊151┊          __typename: 'Mutation',
+┊   ┊152┊          createMessage: {
+┊   ┊153┊            __typename: 'Message',
+┊   ┊154┊            id: -1, // don't know id yet, but it doesn't matter
+┊   ┊155┊            text, // we know what the text will be
+┊   ┊156┊            createdAt: new Date().toISOString(), // the time is now!
+┊   ┊157┊            from: {
+┊   ┊158┊              __typename: 'User',
+┊   ┊159┊              id: 1, // still faking the user
+┊   ┊160┊              username: 'Justyn.Kautzer', // still faking the user
+┊   ┊161┊            },
+┊   ┊162┊            to: {
+┊   ┊163┊              __typename: 'Group',
+┊   ┊164┊              id: groupId,
+┊   ┊165┊            },
+┊   ┊166┊          },
+┊   ┊167┊        },
 ┊150┊168┊        update: (store, { data: { createMessage } }) => {
 ┊151┊169┊          // Read the data from our cache for this query.
 ┊152┊170┊          const data = store.readQuery({
```

[}]: #

The Object returned from `optimisticResponse` is what the data should look like from our server when the mutation succeeds. We need to specify the `__typename` for all  values in our optimistic response just like our server would. Even though we don’t know all values for all fields, we know enough to populate the ones that will show up in the UI, like the text, user, and message creation time. This will essentially be a placeholder until the server responds.

Let’s also modify our UI a bit so that our `FlatList` scrolls to the bottom when we send a message as soon as we receive new data:

[{]: <helper> (diffStep 4.12)

#### Step 4.12: Add scrollToBottom to Messages after send

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -71,6 +71,8 @@
 ┊71┊71┊      groupId: this.props.navigation.state.params.groupId,
 ┊72┊72┊      userId: 1, // faking the user for now
 ┊73┊73┊      text,
+┊  ┊74┊    }).then(() => {
+┊  ┊75┊      this.flatList.scrollToEnd({ animated: true });
 ┊74┊76┊    });
 ┊75┊77┊  }
 ┊76┊78┊
```
```diff
@@ -105,6 +107,7 @@
 ┊105┊107┊        style={styles.container}
 ┊106┊108┊      >
 ┊107┊109┊        <FlatList
+┊   ┊110┊          ref={(ref) => { this.flatList = ref; }}
 ┊108┊111┊          data={group.messages.slice().reverse()}
 ┊109┊112┊          keyExtractor={this.keyExtractor}
 ┊110┊113┊          renderItem={this.renderItem}
```

[}]: #

![Scroll to Bottom Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step4-12.gif)

### 🔥🔥🔥!!!

# **YOUR CHALLENGE**
First, let’s take a break. We’ve definitely earned it.

Now that we’re comfortable using GraphQL Queries and Mutations and some tricky stuff in React Native, we can do most of the things we need to do for most basic applications. In fact, there are a number of Chatty features that we can already implement without knowing much else. This post is already plenty long, but there are features left to be built. So with that said, I like to suggest that you try to complete the following features on your own before we move on:

1. Add GraphQL Mutations on our server for creating, modifying, and deleting `Groups`
2. Add new Screens to our React Native app for creating, modifying, and deleting `Groups`
3. Build GraphQL Queries and Mutations for our new Screens and connect them using `react-apollo`
4. Include `update` for these new mutations where necessary

If you want to see some UI or you want a hint or you don’t wanna write any code, that’s cool too! Below is some code with these features added. ![Groups Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step4-13.gif)

[{]: <helper> (diffStep 4.13)

#### Step 4.13: Add Group Mutations and Screens

##### Changed client&#x2F;package.json
```diff
@@ -9,6 +9,7 @@
 ┊ 9┊ 9┊	"dependencies": {
 ┊10┊10┊		"apollo-client": "^1.4.0",
 ┊11┊11┊		"graphql-tag": "^2.2.1",
+┊  ┊12┊		"immutability-helper": "^2.2.2",
 ┊12┊13┊		"lodash": "^4.17.4",
 ┊13┊14┊		"moment": "^2.18.1",
 ┊14┊15┊		"prop-types": "^15.5.10",
```
```diff
@@ -16,6 +17,7 @@
 ┊16┊17┊		"react": "16.0.0-alpha.6",
 ┊17┊18┊		"react-apollo": "^1.4.2",
 ┊18┊19┊		"react-native": "0.44.3",
+┊  ┊20┊		"react-native-alphabetlistview": "^0.2.0",
 ┊19┊21┊		"react-native-vector-icons": "^4.2.0",
 ┊20┊22┊		"react-navigation": "^1.0.0-beta.11",
 ┊21┊23┊		"react-redux": "^5.0.5",
```

##### Added client&#x2F;src&#x2F;components&#x2F;selected-user-list.component.js
```diff
@@ -0,0 +1,115 @@
+┊   ┊  1┊import React, { Component } from 'react';
+┊   ┊  2┊import PropTypes from 'prop-types';
+┊   ┊  3┊import {
+┊   ┊  4┊  Image,
+┊   ┊  5┊  ListView,
+┊   ┊  6┊  StyleSheet,
+┊   ┊  7┊  Text,
+┊   ┊  8┊  TouchableOpacity,
+┊   ┊  9┊  View,
+┊   ┊ 10┊} from 'react-native';
+┊   ┊ 11┊import Icon from 'react-native-vector-icons/FontAwesome';
+┊   ┊ 12┊
+┊   ┊ 13┊const styles = StyleSheet.create({
+┊   ┊ 14┊  list: {
+┊   ┊ 15┊    paddingVertical: 8,
+┊   ┊ 16┊  },
+┊   ┊ 17┊  itemContainer: {
+┊   ┊ 18┊    alignItems: 'center',
+┊   ┊ 19┊    paddingHorizontal: 12,
+┊   ┊ 20┊  },
+┊   ┊ 21┊  itemIcon: {
+┊   ┊ 22┊    alignItems: 'center',
+┊   ┊ 23┊    backgroundColor: '#dbdbdb',
+┊   ┊ 24┊    borderColor: 'white',
+┊   ┊ 25┊    borderRadius: 10,
+┊   ┊ 26┊    borderWidth: 2,
+┊   ┊ 27┊    flexDirection: 'row',
+┊   ┊ 28┊    height: 20,
+┊   ┊ 29┊    justifyContent: 'center',
+┊   ┊ 30┊    position: 'absolute',
+┊   ┊ 31┊    right: -3,
+┊   ┊ 32┊    top: -3,
+┊   ┊ 33┊    width: 20,
+┊   ┊ 34┊  },
+┊   ┊ 35┊  itemImage: {
+┊   ┊ 36┊    borderRadius: 27,
+┊   ┊ 37┊    height: 54,
+┊   ┊ 38┊    width: 54,
+┊   ┊ 39┊  },
+┊   ┊ 40┊});
+┊   ┊ 41┊
+┊   ┊ 42┊export class SelectedUserListItem extends Component {
+┊   ┊ 43┊  constructor(props) {
+┊   ┊ 44┊    super(props);
+┊   ┊ 45┊
+┊   ┊ 46┊    this.remove = this.remove.bind(this);
+┊   ┊ 47┊  }
+┊   ┊ 48┊
+┊   ┊ 49┊  remove() {
+┊   ┊ 50┊    this.props.remove(this.props.user);
+┊   ┊ 51┊  }
+┊   ┊ 52┊
+┊   ┊ 53┊  render() {
+┊   ┊ 54┊    const { username } = this.props.user;
+┊   ┊ 55┊
+┊   ┊ 56┊    return (
+┊   ┊ 57┊      <View
+┊   ┊ 58┊        style={styles.itemContainer}
+┊   ┊ 59┊      >
+┊   ┊ 60┊        <View>
+┊   ┊ 61┊          <Image
+┊   ┊ 62┊            style={styles.itemImage}
+┊   ┊ 63┊            source={{ uri: 'https://facebook.github.io/react/img/logo_og.png' }}
+┊   ┊ 64┊          />
+┊   ┊ 65┊          <TouchableOpacity onPress={this.remove} style={styles.itemIcon}>
+┊   ┊ 66┊            <Icon
+┊   ┊ 67┊              color={'white'}
+┊   ┊ 68┊              name={'times'}
+┊   ┊ 69┊              size={12}
+┊   ┊ 70┊            />
+┊   ┊ 71┊          </TouchableOpacity>
+┊   ┊ 72┊        </View>
+┊   ┊ 73┊        <Text>{username}</Text>
+┊   ┊ 74┊      </View>
+┊   ┊ 75┊    );
+┊   ┊ 76┊  }
+┊   ┊ 77┊}
+┊   ┊ 78┊SelectedUserListItem.propTypes = {
+┊   ┊ 79┊  user: PropTypes.shape({
+┊   ┊ 80┊    id: PropTypes.number,
+┊   ┊ 81┊    username: PropTypes.string,
+┊   ┊ 82┊  }),
+┊   ┊ 83┊  remove: PropTypes.func,
+┊   ┊ 84┊};
+┊   ┊ 85┊
+┊   ┊ 86┊class SelectedUserList extends Component {
+┊   ┊ 87┊  constructor(props) {
+┊   ┊ 88┊    super(props);
+┊   ┊ 89┊
+┊   ┊ 90┊    this.renderRow = this.renderRow.bind(this);
+┊   ┊ 91┊  }
+┊   ┊ 92┊
+┊   ┊ 93┊  renderRow(user) {
+┊   ┊ 94┊    return (
+┊   ┊ 95┊      <SelectedUserListItem user={user} remove={this.props.remove} />
+┊   ┊ 96┊    );
+┊   ┊ 97┊  }
+┊   ┊ 98┊
+┊   ┊ 99┊  render() {
+┊   ┊100┊    return (
+┊   ┊101┊      <ListView
+┊   ┊102┊        dataSource={this.props.dataSource}
+┊   ┊103┊        renderRow={this.renderRow}
+┊   ┊104┊        horizontal
+┊   ┊105┊        style={styles.list}
+┊   ┊106┊      />
+┊   ┊107┊    );
+┊   ┊108┊  }
+┊   ┊109┊}
+┊   ┊110┊SelectedUserList.propTypes = {
+┊   ┊111┊  dataSource: PropTypes.instanceOf(ListView.DataSource),
+┊   ┊112┊  remove: PropTypes.func,
+┊   ┊113┊};
+┊   ┊114┊
+┊   ┊115┊export default SelectedUserList;
```

##### Added client&#x2F;src&#x2F;graphql&#x2F;create-group.mutation.js
```diff
@@ -0,0 +1,15 @@
+┊  ┊ 1┊import gql from 'graphql-tag';
+┊  ┊ 2┊
+┊  ┊ 3┊const CREATE_GROUP_MUTATION = gql`
+┊  ┊ 4┊  mutation createGroup($name: String!, $userIds: [Int!], $userId: Int!) {
+┊  ┊ 5┊    createGroup(name: $name, userIds: $userIds, userId: $userId) {
+┊  ┊ 6┊      id
+┊  ┊ 7┊      name
+┊  ┊ 8┊      users {
+┊  ┊ 9┊        id
+┊  ┊10┊      }
+┊  ┊11┊    }
+┊  ┊12┊  }
+┊  ┊13┊`;
+┊  ┊14┊
+┊  ┊15┊export default CREATE_GROUP_MUTATION;
```

##### Added client&#x2F;src&#x2F;graphql&#x2F;delete-group.mutation.js
```diff
@@ -0,0 +1,11 @@
+┊  ┊ 1┊import gql from 'graphql-tag';
+┊  ┊ 2┊
+┊  ┊ 3┊const DELETE_GROUP_MUTATION = gql`
+┊  ┊ 4┊  mutation deleteGroup($id: Int!) {
+┊  ┊ 5┊    deleteGroup(id: $id) {
+┊  ┊ 6┊      id
+┊  ┊ 7┊    }
+┊  ┊ 8┊  }
+┊  ┊ 9┊`;
+┊  ┊10┊
+┊  ┊11┊export default DELETE_GROUP_MUTATION;
```

##### Added client&#x2F;src&#x2F;graphql&#x2F;leave-group.mutation.js
```diff
@@ -0,0 +1,11 @@
+┊  ┊ 1┊import gql from 'graphql-tag';
+┊  ┊ 2┊
+┊  ┊ 3┊const LEAVE_GROUP_MUTATION = gql`
+┊  ┊ 4┊  mutation leaveGroup($id: Int!, $userId: Int!) {
+┊  ┊ 5┊    leaveGroup(id: $id, userId: $userId) {
+┊  ┊ 6┊      id
+┊  ┊ 7┊    }
+┊  ┊ 8┊  }
+┊  ┊ 9┊`;
+┊  ┊10┊
+┊  ┊11┊export default LEAVE_GROUP_MUTATION;
```

##### Changed client&#x2F;src&#x2F;graphql&#x2F;user.query.js
```diff
@@ -11,6 +11,10 @@
 ┊11┊11┊        id
 ┊12┊12┊        name
 ┊13┊13┊      }
+┊  ┊14┊      friends {
+┊  ┊15┊        id
+┊  ┊16┊        username
+┊  ┊17┊      }
 ┊14┊18┊    }
 ┊15┊19┊  }
 ┊16┊20┊`;
```

##### Changed client&#x2F;src&#x2F;navigation.js
```diff
@@ -6,6 +6,9 @@
 ┊ 6┊ 6┊
 ┊ 7┊ 7┊import Groups from './screens/groups.screen';
 ┊ 8┊ 8┊import Messages from './screens/messages.screen';
+┊  ┊ 9┊import FinalizeGroup from './screens/finalize-group.screen';
+┊  ┊10┊import GroupDetails from './screens/group-details.screen';
+┊  ┊11┊import NewGroup from './screens/new-group.screen';
 ┊ 9┊12┊
 ┊10┊13┊const styles = StyleSheet.create({
 ┊11┊14┊  container: {
```
```diff
@@ -41,6 +44,9 @@
 ┊41┊44┊const AppNavigator = StackNavigator({
 ┊42┊45┊  Main: { screen: MainScreenNavigator },
 ┊43┊46┊  Messages: { screen: Messages },
+┊  ┊47┊  GroupDetails: { screen: GroupDetails },
+┊  ┊48┊  NewGroup: { screen: NewGroup },
+┊  ┊49┊  FinalizeGroup: { screen: FinalizeGroup },
 ┊44┊50┊}, {
 ┊45┊51┊  mode: 'modal',
 ┊46┊52┊});
```

##### Added client&#x2F;src&#x2F;screens&#x2F;finalize-group.screen.js
```diff
@@ -0,0 +1,278 @@
+┊   ┊  1┊import { _ } from 'lodash';
+┊   ┊  2┊import React, { Component } from 'react';
+┊   ┊  3┊import PropTypes from 'prop-types';
+┊   ┊  4┊import {
+┊   ┊  5┊  Alert,
+┊   ┊  6┊  Button,
+┊   ┊  7┊  Image,
+┊   ┊  8┊  ListView,
+┊   ┊  9┊  StyleSheet,
+┊   ┊ 10┊  Text,
+┊   ┊ 11┊  TextInput,
+┊   ┊ 12┊  TouchableOpacity,
+┊   ┊ 13┊  View,
+┊   ┊ 14┊} from 'react-native';
+┊   ┊ 15┊import { graphql, compose } from 'react-apollo';
+┊   ┊ 16┊import { NavigationActions } from 'react-navigation';
+┊   ┊ 17┊import update from 'immutability-helper';
+┊   ┊ 18┊
+┊   ┊ 19┊import { USER_QUERY } from '../graphql/user.query';
+┊   ┊ 20┊import CREATE_GROUP_MUTATION from '../graphql/create-group.mutation';
+┊   ┊ 21┊import SelectedUserList from '../components/selected-user-list.component';
+┊   ┊ 22┊
+┊   ┊ 23┊const goToNewGroup = group => NavigationActions.reset({
+┊   ┊ 24┊  index: 1,
+┊   ┊ 25┊  actions: [
+┊   ┊ 26┊    NavigationActions.navigate({ routeName: 'Main' }),
+┊   ┊ 27┊    NavigationActions.navigate({ routeName: 'Messages', params: { groupId: group.id, title: group.name } }),
+┊   ┊ 28┊  ],
+┊   ┊ 29┊});
+┊   ┊ 30┊
+┊   ┊ 31┊const styles = StyleSheet.create({
+┊   ┊ 32┊  container: {
+┊   ┊ 33┊    flex: 1,
+┊   ┊ 34┊    backgroundColor: 'white',
+┊   ┊ 35┊  },
+┊   ┊ 36┊  detailsContainer: {
+┊   ┊ 37┊    padding: 20,
+┊   ┊ 38┊    flexDirection: 'row',
+┊   ┊ 39┊  },
+┊   ┊ 40┊  imageContainer: {
+┊   ┊ 41┊    paddingRight: 20,
+┊   ┊ 42┊    alignItems: 'center',
+┊   ┊ 43┊  },
+┊   ┊ 44┊  inputContainer: {
+┊   ┊ 45┊    flexDirection: 'column',
+┊   ┊ 46┊    flex: 1,
+┊   ┊ 47┊  },
+┊   ┊ 48┊  input: {
+┊   ┊ 49┊    color: 'black',
+┊   ┊ 50┊    height: 32,
+┊   ┊ 51┊  },
+┊   ┊ 52┊  inputBorder: {
+┊   ┊ 53┊    borderColor: '#dbdbdb',
+┊   ┊ 54┊    borderBottomWidth: 1,
+┊   ┊ 55┊    borderTopWidth: 1,
+┊   ┊ 56┊    paddingVertical: 8,
+┊   ┊ 57┊  },
+┊   ┊ 58┊  inputInstructions: {
+┊   ┊ 59┊    paddingTop: 6,
+┊   ┊ 60┊    color: '#777',
+┊   ┊ 61┊    fontSize: 12,
+┊   ┊ 62┊  },
+┊   ┊ 63┊  groupImage: {
+┊   ┊ 64┊    width: 54,
+┊   ┊ 65┊    height: 54,
+┊   ┊ 66┊    borderRadius: 27,
+┊   ┊ 67┊  },
+┊   ┊ 68┊  selected: {
+┊   ┊ 69┊    flexDirection: 'row',
+┊   ┊ 70┊  },
+┊   ┊ 71┊  loading: {
+┊   ┊ 72┊    justifyContent: 'center',
+┊   ┊ 73┊    flex: 1,
+┊   ┊ 74┊  },
+┊   ┊ 75┊  navIcon: {
+┊   ┊ 76┊    color: 'blue',
+┊   ┊ 77┊    fontSize: 18,
+┊   ┊ 78┊    paddingTop: 2,
+┊   ┊ 79┊  },
+┊   ┊ 80┊  participants: {
+┊   ┊ 81┊    paddingHorizontal: 20,
+┊   ┊ 82┊    paddingVertical: 6,
+┊   ┊ 83┊    backgroundColor: '#dbdbdb',
+┊   ┊ 84┊    color: '#777',
+┊   ┊ 85┊  },
+┊   ┊ 86┊});
+┊   ┊ 87┊
+┊   ┊ 88┊// helper function checks for duplicate groups, which we receive because we
+┊   ┊ 89┊// get subscription updates for our own groups as well.
+┊   ┊ 90┊// TODO it's pretty inefficient to scan all the groups every time.
+┊   ┊ 91┊// maybe only scan the first 10, or up to a certain timestamp
+┊   ┊ 92┊function isDuplicateGroup(newGroup, existingGroups) {
+┊   ┊ 93┊  return newGroup.id !== null && existingGroups.some(group => newGroup.id === group.id);
+┊   ┊ 94┊}
+┊   ┊ 95┊
+┊   ┊ 96┊class FinalizeGroup extends Component {
+┊   ┊ 97┊  static navigationOptions = ({ navigation }) => {
+┊   ┊ 98┊    const { state } = navigation;
+┊   ┊ 99┊    const isReady = state.params && state.params.mode === 'ready';
+┊   ┊100┊    return {
+┊   ┊101┊      title: 'New Group',
+┊   ┊102┊      headerRight: (
+┊   ┊103┊        isReady ? <Button
+┊   ┊104┊          title="Create"
+┊   ┊105┊          onPress={state.params.create}
+┊   ┊106┊        /> : undefined
+┊   ┊107┊      ),
+┊   ┊108┊    };
+┊   ┊109┊  };
+┊   ┊110┊
+┊   ┊111┊  constructor(props) {
+┊   ┊112┊    super(props);
+┊   ┊113┊
+┊   ┊114┊    const { selected } = props.navigation.state.params;
+┊   ┊115┊
+┊   ┊116┊    this.state = {
+┊   ┊117┊      selected,
+┊   ┊118┊      ds: new ListView.DataSource({
+┊   ┊119┊        rowHasChanged: (r1, r2) => r1 !== r2,
+┊   ┊120┊      }).cloneWithRows(selected),
+┊   ┊121┊    };
+┊   ┊122┊
+┊   ┊123┊    this.create = this.create.bind(this);
+┊   ┊124┊    this.pop = this.pop.bind(this);
+┊   ┊125┊    this.remove = this.remove.bind(this);
+┊   ┊126┊  }
+┊   ┊127┊
+┊   ┊128┊  componentDidMount() {
+┊   ┊129┊    this.refreshNavigation(this.state.selected.length && this.state.name);
+┊   ┊130┊  }
+┊   ┊131┊
+┊   ┊132┊  componentWillUpdate(nextProps, nextState) {
+┊   ┊133┊    if ((nextState.selected.length && nextState.name) !==
+┊   ┊134┊      (this.state.selected.length && this.state.name)) {
+┊   ┊135┊      this.refreshNavigation(nextState.selected.length && nextState.name);
+┊   ┊136┊    }
+┊   ┊137┊  }
+┊   ┊138┊
+┊   ┊139┊  pop() {
+┊   ┊140┊    this.props.navigation.goBack();
+┊   ┊141┊  }
+┊   ┊142┊
+┊   ┊143┊  remove(user) {
+┊   ┊144┊    const index = this.state.selected.indexOf(user);
+┊   ┊145┊    if (~index) {
+┊   ┊146┊      const selected = update(this.state.selected, { $splice: [[index, 1]] });
+┊   ┊147┊      this.setState({
+┊   ┊148┊        selected,
+┊   ┊149┊        ds: this.state.ds.cloneWithRows(selected),
+┊   ┊150┊      });
+┊   ┊151┊    }
+┊   ┊152┊  }
+┊   ┊153┊
+┊   ┊154┊  create() {
+┊   ┊155┊    const { createGroup } = this.props;
+┊   ┊156┊
+┊   ┊157┊    createGroup({
+┊   ┊158┊      name: this.state.name,
+┊   ┊159┊      userId: 1, // fake user for now
+┊   ┊160┊      userIds: _.map(this.state.selected, 'id'),
+┊   ┊161┊    }).then((res) => {
+┊   ┊162┊      this.props.navigation.dispatch(goToNewGroup(res.data.createGroup));
+┊   ┊163┊    }).catch((error) => {
+┊   ┊164┊      Alert.alert(
+┊   ┊165┊        'Error Creating New Group',
+┊   ┊166┊        error.message,
+┊   ┊167┊        [
+┊   ┊168┊          { text: 'OK', onPress: () => {} },
+┊   ┊169┊        ],
+┊   ┊170┊      );
+┊   ┊171┊    });
+┊   ┊172┊  }
+┊   ┊173┊
+┊   ┊174┊  refreshNavigation(ready) {
+┊   ┊175┊    const { navigation } = this.props;
+┊   ┊176┊    navigation.setParams({
+┊   ┊177┊      mode: ready ? 'ready' : undefined,
+┊   ┊178┊      create: this.create,
+┊   ┊179┊    });
+┊   ┊180┊  }
+┊   ┊181┊
+┊   ┊182┊  render() {
+┊   ┊183┊    const { friendCount } = this.props.navigation.state.params;
+┊   ┊184┊
+┊   ┊185┊    return (
+┊   ┊186┊      <View style={styles.container}>
+┊   ┊187┊        <View style={styles.detailsContainer}>
+┊   ┊188┊          <TouchableOpacity style={styles.imageContainer}>
+┊   ┊189┊            <Image
+┊   ┊190┊              style={styles.groupImage}
+┊   ┊191┊              source={{ uri: 'https://facebook.github.io/react/img/logo_og.png' }}
+┊   ┊192┊            />
+┊   ┊193┊            <Text>edit</Text>
+┊   ┊194┊          </TouchableOpacity>
+┊   ┊195┊          <View style={styles.inputContainer}>
+┊   ┊196┊            <View style={styles.inputBorder}>
+┊   ┊197┊              <TextInput
+┊   ┊198┊                autoFocus
+┊   ┊199┊                onChangeText={name => this.setState({ name })}
+┊   ┊200┊                placeholder="Group Subject"
+┊   ┊201┊                style={styles.input}
+┊   ┊202┊              />
+┊   ┊203┊            </View>
+┊   ┊204┊            <Text style={styles.inputInstructions}>
+┊   ┊205┊              {'Please provide a group subject and optional group icon'}
+┊   ┊206┊            </Text>
+┊   ┊207┊          </View>
+┊   ┊208┊        </View>
+┊   ┊209┊        <Text style={styles.participants}>
+┊   ┊210┊          {`participants: ${this.state.selected.length} of ${friendCount}`.toUpperCase()}
+┊   ┊211┊        </Text>
+┊   ┊212┊        <View style={styles.selected}>
+┊   ┊213┊          {this.state.selected.length ?
+┊   ┊214┊            <SelectedUserList
+┊   ┊215┊              dataSource={this.state.ds}
+┊   ┊216┊              remove={this.remove}
+┊   ┊217┊            /> : undefined}
+┊   ┊218┊        </View>
+┊   ┊219┊      </View>
+┊   ┊220┊    );
+┊   ┊221┊  }
+┊   ┊222┊}
+┊   ┊223┊
+┊   ┊224┊FinalizeGroup.propTypes = {
+┊   ┊225┊  createGroup: PropTypes.func.isRequired,
+┊   ┊226┊  navigation: PropTypes.shape({
+┊   ┊227┊    dispatch: PropTypes.func,
+┊   ┊228┊    goBack: PropTypes.func,
+┊   ┊229┊    state: PropTypes.shape({
+┊   ┊230┊      params: PropTypes.shape({
+┊   ┊231┊        friendCount: PropTypes.number.isRequired,
+┊   ┊232┊      }),
+┊   ┊233┊    }),
+┊   ┊234┊  }),
+┊   ┊235┊};
+┊   ┊236┊
+┊   ┊237┊const createGroupMutation = graphql(CREATE_GROUP_MUTATION, {
+┊   ┊238┊  props: ({ mutate }) => ({
+┊   ┊239┊    createGroup: ({ name, userIds, userId }) =>
+┊   ┊240┊      mutate({
+┊   ┊241┊        variables: { name, userIds, userId },
+┊   ┊242┊        update: (store, { data: { createGroup } }) => {
+┊   ┊243┊          // Read the data from our cache for this query.
+┊   ┊244┊          const data = store.readQuery({ query: USER_QUERY, variables: { id: userId } });
+┊   ┊245┊
+┊   ┊246┊          if (isDuplicateGroup(createGroup, data.user.groups)) {
+┊   ┊247┊            return;
+┊   ┊248┊          }
+┊   ┊249┊
+┊   ┊250┊          // Add our message from the mutation to the end.
+┊   ┊251┊          data.user.groups.push(createGroup);
+┊   ┊252┊
+┊   ┊253┊          // Write our data back to the cache.
+┊   ┊254┊          store.writeQuery({
+┊   ┊255┊            query: USER_QUERY,
+┊   ┊256┊            variables: { id: userId },
+┊   ┊257┊            data,
+┊   ┊258┊          });
+┊   ┊259┊        },
+┊   ┊260┊      }),
+┊   ┊261┊  }),
+┊   ┊262┊});
+┊   ┊263┊
+┊   ┊264┊const userQuery = graphql(USER_QUERY, {
+┊   ┊265┊  options: ownProps => ({
+┊   ┊266┊    variables: {
+┊   ┊267┊      id: ownProps.navigation.state.params.userId,
+┊   ┊268┊    },
+┊   ┊269┊  }),
+┊   ┊270┊  props: ({ data: { loading, user } }) => ({
+┊   ┊271┊    loading, user,
+┊   ┊272┊  }),
+┊   ┊273┊});
+┊   ┊274┊
+┊   ┊275┊export default compose(
+┊   ┊276┊  userQuery,
+┊   ┊277┊  createGroupMutation,
+┊   ┊278┊)(FinalizeGroup);
```

##### Added client&#x2F;src&#x2F;screens&#x2F;group-details.screen.js
```diff
@@ -0,0 +1,277 @@
+┊   ┊  1┊// TODO: update group functionality
+┊   ┊  2┊import React, { Component } from 'react';
+┊   ┊  3┊import PropTypes from 'prop-types';
+┊   ┊  4┊import {
+┊   ┊  5┊  ActivityIndicator,
+┊   ┊  6┊  Button,
+┊   ┊  7┊  Image,
+┊   ┊  8┊  ListView,
+┊   ┊  9┊  StyleSheet,
+┊   ┊ 10┊  Text,
+┊   ┊ 11┊  TouchableOpacity,
+┊   ┊ 12┊  View,
+┊   ┊ 13┊} from 'react-native';
+┊   ┊ 14┊import { graphql, compose } from 'react-apollo';
+┊   ┊ 15┊import { NavigationActions } from 'react-navigation';
+┊   ┊ 16┊
+┊   ┊ 17┊import GROUP_QUERY from '../graphql/group.query';
+┊   ┊ 18┊import USER_QUERY from '../graphql/user.query';
+┊   ┊ 19┊import DELETE_GROUP_MUTATION from '../graphql/delete-group.mutation';
+┊   ┊ 20┊import LEAVE_GROUP_MUTATION from '../graphql/leave-group.mutation';
+┊   ┊ 21┊
+┊   ┊ 22┊const resetAction = NavigationActions.reset({
+┊   ┊ 23┊  index: 0,
+┊   ┊ 24┊  actions: [
+┊   ┊ 25┊    NavigationActions.navigate({ routeName: 'Main' }),
+┊   ┊ 26┊  ],
+┊   ┊ 27┊});
+┊   ┊ 28┊
+┊   ┊ 29┊const styles = StyleSheet.create({
+┊   ┊ 30┊  container: {
+┊   ┊ 31┊    flex: 1,
+┊   ┊ 32┊  },
+┊   ┊ 33┊  avatar: {
+┊   ┊ 34┊    width: 32,
+┊   ┊ 35┊    height: 32,
+┊   ┊ 36┊    borderRadius: 16,
+┊   ┊ 37┊  },
+┊   ┊ 38┊  detailsContainer: {
+┊   ┊ 39┊    flexDirection: 'row',
+┊   ┊ 40┊    alignItems: 'center',
+┊   ┊ 41┊  },
+┊   ┊ 42┊  listView: {
+┊   ┊ 43┊
+┊   ┊ 44┊  },
+┊   ┊ 45┊  groupImageContainer: {
+┊   ┊ 46┊    paddingTop: 20,
+┊   ┊ 47┊    paddingHorizontal: 20,
+┊   ┊ 48┊    paddingBottom: 6,
+┊   ┊ 49┊    alignItems: 'center',
+┊   ┊ 50┊  },
+┊   ┊ 51┊  groupName: {
+┊   ┊ 52┊    color: 'black',
+┊   ┊ 53┊  },
+┊   ┊ 54┊  groupNameBorder: {
+┊   ┊ 55┊    borderBottomWidth: 1,
+┊   ┊ 56┊    borderColor: '#dbdbdb',
+┊   ┊ 57┊    borderTopWidth: 1,
+┊   ┊ 58┊    flex: 1,
+┊   ┊ 59┊    paddingVertical: 8,
+┊   ┊ 60┊  },
+┊   ┊ 61┊  groupImage: {
+┊   ┊ 62┊    width: 54,
+┊   ┊ 63┊    height: 54,
+┊   ┊ 64┊    borderRadius: 27,
+┊   ┊ 65┊  },
+┊   ┊ 66┊  participants: {
+┊   ┊ 67┊    borderBottomWidth: 1,
+┊   ┊ 68┊    borderColor: '#dbdbdb',
+┊   ┊ 69┊    borderTopWidth: 1,
+┊   ┊ 70┊    paddingHorizontal: 20,
+┊   ┊ 71┊    paddingVertical: 6,
+┊   ┊ 72┊    backgroundColor: '#dbdbdb',
+┊   ┊ 73┊    color: '#777',
+┊   ┊ 74┊  },
+┊   ┊ 75┊  user: {
+┊   ┊ 76┊    alignItems: 'center',
+┊   ┊ 77┊    borderBottomWidth: 1,
+┊   ┊ 78┊    borderColor: '#dbdbdb',
+┊   ┊ 79┊    flexDirection: 'row',
+┊   ┊ 80┊    padding: 10,
+┊   ┊ 81┊  },
+┊   ┊ 82┊  username: {
+┊   ┊ 83┊    flex: 1,
+┊   ┊ 84┊    fontSize: 16,
+┊   ┊ 85┊    paddingHorizontal: 12,
+┊   ┊ 86┊    paddingVertical: 8,
+┊   ┊ 87┊  },
+┊   ┊ 88┊});
+┊   ┊ 89┊
+┊   ┊ 90┊class GroupDetails extends Component {
+┊   ┊ 91┊  static navigationOptions = ({ navigation }) => ({
+┊   ┊ 92┊    title: `${navigation.state.params.title}`,
+┊   ┊ 93┊  });
+┊   ┊ 94┊
+┊   ┊ 95┊  constructor(props) {
+┊   ┊ 96┊    super(props);
+┊   ┊ 97┊
+┊   ┊ 98┊    this.state = {
+┊   ┊ 99┊      ds: new ListView.DataSource({ rowHasChanged: (r1, r2) => r1 !== r2 })
+┊   ┊100┊        .cloneWithRows(props.loading ? [] : props.group.users),
+┊   ┊101┊    };
+┊   ┊102┊
+┊   ┊103┊    this.deleteGroup = this.deleteGroup.bind(this);
+┊   ┊104┊    this.leaveGroup = this.leaveGroup.bind(this);
+┊   ┊105┊  }
+┊   ┊106┊
+┊   ┊107┊  componentWillReceiveProps(nextProps) {
+┊   ┊108┊    if (nextProps.group && nextProps.group.users && nextProps.group !== this.props.group) {
+┊   ┊109┊      this.setState({
+┊   ┊110┊        ds: this.state.ds.cloneWithRows(nextProps.group.users),
+┊   ┊111┊      });
+┊   ┊112┊    }
+┊   ┊113┊  }
+┊   ┊114┊
+┊   ┊115┊  deleteGroup() {
+┊   ┊116┊    this.props.deleteGroup(this.props.navigation.state.params.id)
+┊   ┊117┊      .then(() => {
+┊   ┊118┊        this.props.navigation.dispatch(resetAction);
+┊   ┊119┊      })
+┊   ┊120┊      .catch((e) => {
+┊   ┊121┊        console.log(e);   // eslint-disable-line no-console
+┊   ┊122┊      });
+┊   ┊123┊  }
+┊   ┊124┊
+┊   ┊125┊  leaveGroup() {
+┊   ┊126┊    this.props.leaveGroup({
+┊   ┊127┊      id: this.props.navigation.state.params.id,
+┊   ┊128┊      userId: 1,
+┊   ┊129┊    }) // fake user for now
+┊   ┊130┊      .then(() => {
+┊   ┊131┊        this.props.navigation.dispatch(resetAction);
+┊   ┊132┊      })
+┊   ┊133┊      .catch((e) => {
+┊   ┊134┊        console.log(e);   // eslint-disable-line no-console
+┊   ┊135┊      });
+┊   ┊136┊  }
+┊   ┊137┊
+┊   ┊138┊  render() {
+┊   ┊139┊    const { group, loading } = this.props;
+┊   ┊140┊
+┊   ┊141┊    // render loading placeholder while we fetch messages
+┊   ┊142┊    if (!group || loading) {
+┊   ┊143┊      return (
+┊   ┊144┊        <View style={[styles.loading, styles.container]}>
+┊   ┊145┊          <ActivityIndicator />
+┊   ┊146┊        </View>
+┊   ┊147┊      );
+┊   ┊148┊    }
+┊   ┊149┊
+┊   ┊150┊    return (
+┊   ┊151┊      <View style={styles.container}>
+┊   ┊152┊        <ListView
+┊   ┊153┊          style={styles.listView}
+┊   ┊154┊          enableEmptySections
+┊   ┊155┊          dataSource={this.state.ds}
+┊   ┊156┊          renderHeader={() => (
+┊   ┊157┊            <View>
+┊   ┊158┊              <View style={styles.detailsContainer}>
+┊   ┊159┊                <TouchableOpacity style={styles.groupImageContainer} onPress={this.pickGroupImage}>
+┊   ┊160┊                  <Image
+┊   ┊161┊                    style={styles.groupImage}
+┊   ┊162┊                    source={{ uri: 'https://facebook.github.io/react/img/logo_og.png' }}
+┊   ┊163┊                  />
+┊   ┊164┊                  <Text>edit</Text>
+┊   ┊165┊                </TouchableOpacity>
+┊   ┊166┊                <View style={styles.groupNameBorder}>
+┊   ┊167┊                  <Text style={styles.groupName}>{group.name}</Text>
+┊   ┊168┊                </View>
+┊   ┊169┊              </View>
+┊   ┊170┊              <Text style={styles.participants}>
+┊   ┊171┊                {`participants: ${group.users.length}`.toUpperCase()}
+┊   ┊172┊              </Text>
+┊   ┊173┊            </View>
+┊   ┊174┊          )}
+┊   ┊175┊          renderFooter={() => (
+┊   ┊176┊            <View>
+┊   ┊177┊              <Button title={'Leave Group'} onPress={this.leaveGroup} />
+┊   ┊178┊              <Button title={'Delete Group'} onPress={this.deleteGroup} />
+┊   ┊179┊            </View>
+┊   ┊180┊          )}
+┊   ┊181┊          renderRow={user => (
+┊   ┊182┊            <View style={styles.user}>
+┊   ┊183┊              <Image
+┊   ┊184┊                style={styles.avatar}
+┊   ┊185┊                source={{ uri: 'https://facebook.github.io/react/img/logo_og.png' }}
+┊   ┊186┊              />
+┊   ┊187┊              <Text style={styles.username}>{user.username}</Text>
+┊   ┊188┊            </View>
+┊   ┊189┊          )}
+┊   ┊190┊        />
+┊   ┊191┊      </View>
+┊   ┊192┊    );
+┊   ┊193┊  }
+┊   ┊194┊}
+┊   ┊195┊
+┊   ┊196┊GroupDetails.propTypes = {
+┊   ┊197┊  loading: PropTypes.bool,
+┊   ┊198┊  group: PropTypes.shape({
+┊   ┊199┊    id: PropTypes.number,
+┊   ┊200┊    name: PropTypes.string,
+┊   ┊201┊    users: PropTypes.arrayOf(PropTypes.shape({
+┊   ┊202┊      id: PropTypes.number,
+┊   ┊203┊      username: PropTypes.string,
+┊   ┊204┊    })),
+┊   ┊205┊  }),
+┊   ┊206┊  navigation: PropTypes.shape({
+┊   ┊207┊    dispatch: PropTypes.func,
+┊   ┊208┊    state: PropTypes.shape({
+┊   ┊209┊      params: PropTypes.shape({
+┊   ┊210┊        title: PropTypes.string,
+┊   ┊211┊        id: PropTypes.number,
+┊   ┊212┊      }),
+┊   ┊213┊    }),
+┊   ┊214┊  }),
+┊   ┊215┊  deleteGroup: PropTypes.func.isRequired,
+┊   ┊216┊  leaveGroup: PropTypes.func.isRequired,
+┊   ┊217┊};
+┊   ┊218┊
+┊   ┊219┊const groupQuery = graphql(GROUP_QUERY, {
+┊   ┊220┊  options: ownProps => ({ variables: { groupId: ownProps.navigation.state.params.id } }),
+┊   ┊221┊  props: ({ data: { loading, group } }) => ({
+┊   ┊222┊    loading,
+┊   ┊223┊    group,
+┊   ┊224┊  }),
+┊   ┊225┊});
+┊   ┊226┊
+┊   ┊227┊const deleteGroupMutation = graphql(DELETE_GROUP_MUTATION, {
+┊   ┊228┊  props: ({ ownProps, mutate }) => ({
+┊   ┊229┊    deleteGroup: id =>
+┊   ┊230┊      mutate({
+┊   ┊231┊        variables: { id },
+┊   ┊232┊        update: (store, { data: { deleteGroup } }) => {
+┊   ┊233┊          // Read the data from our cache for this query.
+┊   ┊234┊          const data = store.readQuery({ query: USER_QUERY, variables: { id: 1 } }); // fake for now
+┊   ┊235┊
+┊   ┊236┊          // Add our message from the mutation to the end.
+┊   ┊237┊          data.user.groups = data.user.groups.filter(g => deleteGroup.id !== g.id);
+┊   ┊238┊
+┊   ┊239┊          // Write our data back to the cache.
+┊   ┊240┊          store.writeQuery({
+┊   ┊241┊            query: USER_QUERY,
+┊   ┊242┊            variables: { id: 1 }, // fake for now
+┊   ┊243┊            data,
+┊   ┊244┊          });
+┊   ┊245┊        },
+┊   ┊246┊      }),
+┊   ┊247┊  }),
+┊   ┊248┊});
+┊   ┊249┊
+┊   ┊250┊const leaveGroupMutation = graphql(LEAVE_GROUP_MUTATION, {
+┊   ┊251┊  props: ({ ownProps, mutate }) => ({
+┊   ┊252┊    leaveGroup: ({ id, userId }) =>
+┊   ┊253┊      mutate({
+┊   ┊254┊        variables: { id, userId },
+┊   ┊255┊        update: (store, { data: { leaveGroup } }) => {
+┊   ┊256┊          // Read the data from our cache for this query.
+┊   ┊257┊          const data = store.readQuery({ query: USER_QUERY, variables: { id: 1 } }); // fake for now
+┊   ┊258┊
+┊   ┊259┊          // Add our message from the mutation to the end.
+┊   ┊260┊          data.user.groups = data.user.groups.filter(g => leaveGroup.id !== g.id);
+┊   ┊261┊
+┊   ┊262┊          // Write our data back to the cache.
+┊   ┊263┊          store.writeQuery({
+┊   ┊264┊            query: USER_QUERY,
+┊   ┊265┊            variables: { id: 1 }, // fake for now
+┊   ┊266┊            data,
+┊   ┊267┊          });
+┊   ┊268┊        },
+┊   ┊269┊      }),
+┊   ┊270┊  }),
+┊   ┊271┊});
+┊   ┊272┊
+┊   ┊273┊export default compose(
+┊   ┊274┊  groupQuery,
+┊   ┊275┊  deleteGroupMutation,
+┊   ┊276┊  leaveGroupMutation,
+┊   ┊277┊)(GroupDetails);
```

##### Changed client&#x2F;src&#x2F;screens&#x2F;groups.screen.js
```diff
@@ -3,6 +3,7 @@
 ┊3┊3┊import {
 ┊4┊4┊  FlatList,
 ┊5┊5┊  ActivityIndicator,
+┊ ┊6┊  Button,
 ┊6┊7┊  StyleSheet,
 ┊7┊8┊  Text,
 ┊8┊9┊  TouchableHighlight,
```
```diff
@@ -35,8 +36,27 @@
 ┊35┊36┊    fontWeight: 'bold',
 ┊36┊37┊    flex: 0.7,
 ┊37┊38┊  },
+┊  ┊39┊  header: {
+┊  ┊40┊    alignItems: 'flex-end',
+┊  ┊41┊    padding: 6,
+┊  ┊42┊    borderColor: '#eee',
+┊  ┊43┊    borderBottomWidth: 1,
+┊  ┊44┊  },
+┊  ┊45┊  warning: {
+┊  ┊46┊    textAlign: 'center',
+┊  ┊47┊    padding: 12,
+┊  ┊48┊  },
 ┊38┊49┊});
 ┊39┊50┊
+┊  ┊51┊const Header = ({ onPress }) => (
+┊  ┊52┊  <View style={styles.header}>
+┊  ┊53┊    <Button title={'New Group'} onPress={onPress} />
+┊  ┊54┊  </View>
+┊  ┊55┊);
+┊  ┊56┊Header.propTypes = {
+┊  ┊57┊  onPress: PropTypes.func.isRequired,
+┊  ┊58┊};
+┊  ┊59┊
 ┊40┊60┊class Group extends Component {
 ┊41┊61┊  constructor(props) {
 ┊42┊62┊    super(props);
```
```diff
@@ -75,6 +95,7 @@
 ┊ 75┊ 95┊  constructor(props) {
 ┊ 76┊ 96┊    super(props);
 ┊ 77┊ 97┊    this.goToMessages = this.goToMessages.bind(this);
+┊   ┊ 98┊    this.goToNewGroup = this.goToNewGroup.bind(this);
 ┊ 78┊ 99┊  }
 ┊ 79┊100┊
 ┊ 80┊101┊  keyExtractor = item => item.id;
```
```diff
@@ -84,6 +105,11 @@
 ┊ 84┊105┊    navigate('Messages', { groupId: group.id, title: group.name });
 ┊ 85┊106┊  }
 ┊ 86┊107┊
+┊   ┊108┊  goToNewGroup() {
+┊   ┊109┊    const { navigate } = this.props.navigation;
+┊   ┊110┊    navigate('NewGroup');
+┊   ┊111┊  }
+┊   ┊112┊
 ┊ 87┊113┊  renderItem = ({ item }) => <Group group={item} goToMessages={this.goToMessages} />;
 ┊ 88┊114┊
 ┊ 89┊115┊  render() {
```
```diff
@@ -98,6 +124,15 @@
 ┊ 98┊124┊      );
 ┊ 99┊125┊    }
 ┊100┊126┊
+┊   ┊127┊    if (user && !user.groups.length) {
+┊   ┊128┊      return (
+┊   ┊129┊        <View style={styles.container}>
+┊   ┊130┊          <Header onPress={this.goToNewGroup} />
+┊   ┊131┊          <Text style={styles.warning}>{'You do not have any groups.'}</Text>
+┊   ┊132┊        </View>
+┊   ┊133┊      );
+┊   ┊134┊    }
+┊   ┊135┊
 ┊101┊136┊    // render list of groups for user
 ┊102┊137┊    return (
 ┊103┊138┊      <View style={styles.container}>
```
```diff
@@ -105,6 +140,7 @@
 ┊105┊140┊          data={user.groups}
 ┊106┊141┊          keyExtractor={this.keyExtractor}
 ┊107┊142┊          renderItem={this.renderItem}
+┊   ┊143┊          ListHeaderComponent={() => <Header onPress={this.goToNewGroup} />}
 ┊108┊144┊        />
 ┊109┊145┊      </View>
 ┊110┊146┊    );
```

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -1,8 +1,11 @@
 ┊ 1┊ 1┊import {
 ┊ 2┊ 2┊  ActivityIndicator,
 ┊ 3┊ 3┊  FlatList,
+┊  ┊ 4┊  Image,
 ┊ 4┊ 5┊  KeyboardAvoidingView,
 ┊ 5┊ 6┊  StyleSheet,
+┊  ┊ 7┊  Text,
+┊  ┊ 8┊  TouchableOpacity,
 ┊ 6┊ 9┊  View,
 ┊ 7┊10┊} from 'react-native';
 ┊ 8┊11┊import PropTypes from 'prop-types';
```
```diff
@@ -25,6 +28,22 @@
 ┊25┊28┊  loading: {
 ┊26┊29┊    justifyContent: 'center',
 ┊27┊30┊  },
+┊  ┊31┊  titleWrapper: {
+┊  ┊32┊    alignItems: 'center',
+┊  ┊33┊    position: 'absolute',
+┊  ┊34┊    left: 0,
+┊  ┊35┊    right: 0,
+┊  ┊36┊  },
+┊  ┊37┊  title: {
+┊  ┊38┊    flexDirection: 'row',
+┊  ┊39┊    alignItems: 'center',
+┊  ┊40┊  },
+┊  ┊41┊  titleImage: {
+┊  ┊42┊    marginRight: 6,
+┊  ┊43┊    width: 32,
+┊  ┊44┊    height: 32,
+┊  ┊45┊    borderRadius: 16,
+┊  ┊46┊  },
 ┊28┊47┊});
 ┊29┊48┊
 ┊30┊49┊function isDuplicateMessage(newMessage, existingMessages) {
```
```diff
@@ -34,9 +53,28 @@
 ┊34┊53┊
 ┊35┊54┊class Messages extends Component {
 ┊36┊55┊  static navigationOptions = ({ navigation }) => {
-┊37┊  ┊    const { state } = navigation;
-┊38┊  ┊    return {
+┊  ┊56┊    const { state, navigate } = navigation;
+┊  ┊57┊
+┊  ┊58┊    const goToGroupDetails = navigate.bind(this, 'GroupDetails', {
+┊  ┊59┊      id: state.params.groupId,
 ┊39┊60┊      title: state.params.title,
+┊  ┊61┊    });
+┊  ┊62┊
+┊  ┊63┊    return {
+┊  ┊64┊      headerTitle: (
+┊  ┊65┊        <TouchableOpacity
+┊  ┊66┊          style={styles.titleWrapper}
+┊  ┊67┊          onPress={goToGroupDetails}
+┊  ┊68┊        >
+┊  ┊69┊          <View style={styles.title}>
+┊  ┊70┊            <Image
+┊  ┊71┊              style={styles.titleImage}
+┊  ┊72┊              source={{ uri: 'https://facebook.github.io/react/img/logo_og.png' }}
+┊  ┊73┊            />
+┊  ┊74┊            <Text>{state.params.title}</Text>
+┊  ┊75┊          </View>
+┊  ┊76┊        </TouchableOpacity>
+┊  ┊77┊      ),
 ┊40┊78┊    };
 ┊41┊79┊  };
 ┊42┊80┊
```
```diff
@@ -121,6 +159,7 @@
 ┊121┊159┊Messages.propTypes = {
 ┊122┊160┊  createMessage: PropTypes.func,
 ┊123┊161┊  navigation: PropTypes.shape({
+┊   ┊162┊    navigate: PropTypes.func,
 ┊124┊163┊    state: PropTypes.shape({
 ┊125┊164┊      params: PropTypes.shape({
 ┊126┊165┊        groupId: PropTypes.number,
```

##### Added client&#x2F;src&#x2F;screens&#x2F;new-group.screen.js
```diff
@@ -0,0 +1,325 @@
+┊   ┊  1┊import { _ } from 'lodash';
+┊   ┊  2┊import React, { Component } from 'react';
+┊   ┊  3┊import PropTypes from 'prop-types';
+┊   ┊  4┊import {
+┊   ┊  5┊  ActivityIndicator,
+┊   ┊  6┊  Button,
+┊   ┊  7┊  Image,
+┊   ┊  8┊  ListView,
+┊   ┊  9┊  StyleSheet,
+┊   ┊ 10┊  Text,
+┊   ┊ 11┊  View,
+┊   ┊ 12┊} from 'react-native';
+┊   ┊ 13┊import { graphql, compose } from 'react-apollo';
+┊   ┊ 14┊import AlphabetListView from 'react-native-alphabetlistview';
+┊   ┊ 15┊import update from 'immutability-helper';
+┊   ┊ 16┊import Icon from 'react-native-vector-icons/FontAwesome';
+┊   ┊ 17┊
+┊   ┊ 18┊import SelectedUserList from '../components/selected-user-list.component';
+┊   ┊ 19┊import USER_QUERY from '../graphql/user.query';
+┊   ┊ 20┊
+┊   ┊ 21┊// eslint-disable-next-line
+┊   ┊ 22┊const sortObject = o => Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {});
+┊   ┊ 23┊
+┊   ┊ 24┊const styles = StyleSheet.create({
+┊   ┊ 25┊  container: {
+┊   ┊ 26┊    flex: 1,
+┊   ┊ 27┊    backgroundColor: 'white',
+┊   ┊ 28┊  },
+┊   ┊ 29┊  cellContainer: {
+┊   ┊ 30┊    alignItems: 'center',
+┊   ┊ 31┊    flex: 1,
+┊   ┊ 32┊    flexDirection: 'row',
+┊   ┊ 33┊    flexWrap: 'wrap',
+┊   ┊ 34┊    paddingHorizontal: 12,
+┊   ┊ 35┊    paddingVertical: 6,
+┊   ┊ 36┊  },
+┊   ┊ 37┊  cellImage: {
+┊   ┊ 38┊    width: 32,
+┊   ┊ 39┊    height: 32,
+┊   ┊ 40┊    borderRadius: 16,
+┊   ┊ 41┊  },
+┊   ┊ 42┊  cellLabel: {
+┊   ┊ 43┊    flex: 1,
+┊   ┊ 44┊    fontSize: 16,
+┊   ┊ 45┊    paddingHorizontal: 12,
+┊   ┊ 46┊    paddingVertical: 8,
+┊   ┊ 47┊  },
+┊   ┊ 48┊  selected: {
+┊   ┊ 49┊    flexDirection: 'row',
+┊   ┊ 50┊  },
+┊   ┊ 51┊  loading: {
+┊   ┊ 52┊    justifyContent: 'center',
+┊   ┊ 53┊    flex: 1,
+┊   ┊ 54┊  },
+┊   ┊ 55┊  navIcon: {
+┊   ┊ 56┊    color: 'blue',
+┊   ┊ 57┊    fontSize: 18,
+┊   ┊ 58┊    paddingTop: 2,
+┊   ┊ 59┊  },
+┊   ┊ 60┊  checkButtonContainer: {
+┊   ┊ 61┊    paddingRight: 12,
+┊   ┊ 62┊    paddingVertical: 6,
+┊   ┊ 63┊  },
+┊   ┊ 64┊  checkButton: {
+┊   ┊ 65┊    borderWidth: 1,
+┊   ┊ 66┊    borderColor: '#dbdbdb',
+┊   ┊ 67┊    padding: 4,
+┊   ┊ 68┊    height: 24,
+┊   ┊ 69┊    width: 24,
+┊   ┊ 70┊  },
+┊   ┊ 71┊  checkButtonIcon: {
+┊   ┊ 72┊    marginRight: -4, // default is 12
+┊   ┊ 73┊  },
+┊   ┊ 74┊});
+┊   ┊ 75┊
+┊   ┊ 76┊const SectionHeader = ({ title }) => {
+┊   ┊ 77┊  // inline styles used for brevity, use a stylesheet when possible
+┊   ┊ 78┊  const textStyle = {
+┊   ┊ 79┊    textAlign: 'center',
+┊   ┊ 80┊    color: '#fff',
+┊   ┊ 81┊    fontWeight: '700',
+┊   ┊ 82┊    fontSize: 16,
+┊   ┊ 83┊  };
+┊   ┊ 84┊
+┊   ┊ 85┊  const viewStyle = {
+┊   ┊ 86┊    backgroundColor: '#ccc',
+┊   ┊ 87┊  };
+┊   ┊ 88┊  return (
+┊   ┊ 89┊    <View style={viewStyle}>
+┊   ┊ 90┊      <Text style={textStyle}>{title}</Text>
+┊   ┊ 91┊    </View>
+┊   ┊ 92┊  );
+┊   ┊ 93┊};
+┊   ┊ 94┊SectionHeader.propTypes = {
+┊   ┊ 95┊  title: PropTypes.string,
+┊   ┊ 96┊};
+┊   ┊ 97┊
+┊   ┊ 98┊const SectionItem = ({ title }) => (
+┊   ┊ 99┊  <Text style={{ color: 'blue' }}>{title}</Text>
+┊   ┊100┊);
+┊   ┊101┊SectionItem.propTypes = {
+┊   ┊102┊  title: PropTypes.string,
+┊   ┊103┊};
+┊   ┊104┊
+┊   ┊105┊class Cell extends Component {
+┊   ┊106┊  constructor(props) {
+┊   ┊107┊    super(props);
+┊   ┊108┊    this.toggle = this.toggle.bind(this);
+┊   ┊109┊    this.state = {
+┊   ┊110┊      isSelected: props.isSelected(props.item),
+┊   ┊111┊    };
+┊   ┊112┊  }
+┊   ┊113┊
+┊   ┊114┊  componentWillReceiveProps(nextProps) {
+┊   ┊115┊    this.setState({
+┊   ┊116┊      isSelected: nextProps.isSelected(nextProps.item),
+┊   ┊117┊    });
+┊   ┊118┊  }
+┊   ┊119┊
+┊   ┊120┊  toggle() {
+┊   ┊121┊    this.props.toggle(this.props.item);
+┊   ┊122┊  }
+┊   ┊123┊
+┊   ┊124┊  render() {
+┊   ┊125┊    return (
+┊   ┊126┊      <View style={styles.cellContainer}>
+┊   ┊127┊        <Image
+┊   ┊128┊          style={styles.cellImage}
+┊   ┊129┊          source={{ uri: 'https://facebook.github.io/react/img/logo_og.png' }}
+┊   ┊130┊        />
+┊   ┊131┊        <Text style={styles.cellLabel}>{this.props.item.username}</Text>
+┊   ┊132┊        <View style={styles.checkButtonContainer}>
+┊   ┊133┊          <Icon.Button
+┊   ┊134┊            backgroundColor={this.state.isSelected ? 'blue' : 'white'}
+┊   ┊135┊            borderRadius={12}
+┊   ┊136┊            color={'white'}
+┊   ┊137┊            iconStyle={styles.checkButtonIcon}
+┊   ┊138┊            name={'check'}
+┊   ┊139┊            onPress={this.toggle}
+┊   ┊140┊            size={16}
+┊   ┊141┊            style={styles.checkButton}
+┊   ┊142┊          />
+┊   ┊143┊        </View>
+┊   ┊144┊      </View>
+┊   ┊145┊    );
+┊   ┊146┊  }
+┊   ┊147┊}
+┊   ┊148┊Cell.propTypes = {
+┊   ┊149┊  isSelected: PropTypes.func,
+┊   ┊150┊  item: PropTypes.shape({
+┊   ┊151┊    username: PropTypes.string.isRequired,
+┊   ┊152┊  }).isRequired,
+┊   ┊153┊  toggle: PropTypes.func.isRequired,
+┊   ┊154┊};
+┊   ┊155┊
+┊   ┊156┊class NewGroup extends Component {
+┊   ┊157┊  static navigationOptions = ({ navigation }) => {
+┊   ┊158┊    const { state } = navigation;
+┊   ┊159┊    const isReady = state.params && state.params.mode === 'ready';
+┊   ┊160┊    return {
+┊   ┊161┊      title: 'New Group',
+┊   ┊162┊      headerRight: (
+┊   ┊163┊        isReady ? <Button
+┊   ┊164┊          title="Next"
+┊   ┊165┊          onPress={state.params.finalizeGroup}
+┊   ┊166┊        /> : undefined
+┊   ┊167┊      ),
+┊   ┊168┊    };
+┊   ┊169┊  };
+┊   ┊170┊
+┊   ┊171┊  constructor(props) {
+┊   ┊172┊    super(props);
+┊   ┊173┊
+┊   ┊174┊    let selected = [];
+┊   ┊175┊    if (this.props.navigation.state.params) {
+┊   ┊176┊      selected = this.props.navigation.state.params.selected;
+┊   ┊177┊    }
+┊   ┊178┊
+┊   ┊179┊    this.state = {
+┊   ┊180┊      selected: selected || [],
+┊   ┊181┊      friends: props.user ?
+┊   ┊182┊        _.groupBy(props.user.friends, friend => friend.username.charAt(0).toUpperCase()) : [],
+┊   ┊183┊      ds: new ListView.DataSource({ rowHasChanged: (r1, r2) => r1 !== r2 }),
+┊   ┊184┊    };
+┊   ┊185┊
+┊   ┊186┊    this.finalizeGroup = this.finalizeGroup.bind(this);
+┊   ┊187┊    this.isSelected = this.isSelected.bind(this);
+┊   ┊188┊    this.toggle = this.toggle.bind(this);
+┊   ┊189┊  }
+┊   ┊190┊
+┊   ┊191┊  componentDidMount() {
+┊   ┊192┊    this.refreshNavigation(this.state.selected);
+┊   ┊193┊  }
+┊   ┊194┊
+┊   ┊195┊  componentWillReceiveProps(nextProps) {
+┊   ┊196┊    const state = {};
+┊   ┊197┊    if (nextProps.user && nextProps.user.friends && nextProps.user !== this.props.user) {
+┊   ┊198┊      state.friends = sortObject(
+┊   ┊199┊        _.groupBy(nextProps.user.friends, friend => friend.username.charAt(0).toUpperCase()),
+┊   ┊200┊      );
+┊   ┊201┊    }
+┊   ┊202┊
+┊   ┊203┊    if (nextProps.selected) {
+┊   ┊204┊      Object.assign(state, {
+┊   ┊205┊        selected: nextProps.selected,
+┊   ┊206┊        ds: this.state.ds.cloneWithRows(nextProps.selected),
+┊   ┊207┊      });
+┊   ┊208┊    }
+┊   ┊209┊
+┊   ┊210┊    this.setState(state);
+┊   ┊211┊  }
+┊   ┊212┊
+┊   ┊213┊  componentWillUpdate(nextProps, nextState) {
+┊   ┊214┊    if (!!this.state.selected.length !== !!nextState.selected.length) {
+┊   ┊215┊      this.refreshNavigation(nextState.selected);
+┊   ┊216┊    }
+┊   ┊217┊  }
+┊   ┊218┊
+┊   ┊219┊  refreshNavigation(selected) {
+┊   ┊220┊    const { navigation } = this.props;
+┊   ┊221┊    navigation.setParams({
+┊   ┊222┊      mode: selected && selected.length ? 'ready' : undefined,
+┊   ┊223┊      finalizeGroup: this.finalizeGroup,
+┊   ┊224┊    });
+┊   ┊225┊  }
+┊   ┊226┊
+┊   ┊227┊  finalizeGroup() {
+┊   ┊228┊    const { navigate } = this.props.navigation;
+┊   ┊229┊    navigate('FinalizeGroup', {
+┊   ┊230┊      selected: this.state.selected,
+┊   ┊231┊      friendCount: this.props.user.friends.length,
+┊   ┊232┊      userId: this.props.user.id,
+┊   ┊233┊    });
+┊   ┊234┊  }
+┊   ┊235┊
+┊   ┊236┊  isSelected(user) {
+┊   ┊237┊    return ~this.state.selected.indexOf(user);
+┊   ┊238┊  }
+┊   ┊239┊
+┊   ┊240┊  toggle(user) {
+┊   ┊241┊    const index = this.state.selected.indexOf(user);
+┊   ┊242┊    if (~index) {
+┊   ┊243┊      const selected = update(this.state.selected, { $splice: [[index, 1]] });
+┊   ┊244┊
+┊   ┊245┊      return this.setState({
+┊   ┊246┊        selected,
+┊   ┊247┊        ds: this.state.ds.cloneWithRows(selected),
+┊   ┊248┊      });
+┊   ┊249┊    }
+┊   ┊250┊
+┊   ┊251┊    const selected = [...this.state.selected, user];
+┊   ┊252┊
+┊   ┊253┊    return this.setState({
+┊   ┊254┊      selected,
+┊   ┊255┊      ds: this.state.ds.cloneWithRows(selected),
+┊   ┊256┊    });
+┊   ┊257┊  }
+┊   ┊258┊
+┊   ┊259┊  render() {
+┊   ┊260┊    const { user, loading } = this.props;
+┊   ┊261┊
+┊   ┊262┊    // render loading placeholder while we fetch messages
+┊   ┊263┊    if (loading || !user) {
+┊   ┊264┊      return (
+┊   ┊265┊        <View style={[styles.loading, styles.container]}>
+┊   ┊266┊          <ActivityIndicator />
+┊   ┊267┊        </View>
+┊   ┊268┊      );
+┊   ┊269┊    }
+┊   ┊270┊
+┊   ┊271┊    return (
+┊   ┊272┊      <View style={styles.container}>
+┊   ┊273┊        {this.state.selected.length ? <View style={styles.selected}>
+┊   ┊274┊          <SelectedUserList
+┊   ┊275┊            dataSource={this.state.ds}
+┊   ┊276┊            remove={this.toggle}
+┊   ┊277┊          />
+┊   ┊278┊        </View> : undefined}
+┊   ┊279┊        {_.keys(this.state.friends).length ? <AlphabetListView
+┊   ┊280┊          style={{ flex: 1 }}
+┊   ┊281┊          data={this.state.friends}
+┊   ┊282┊          cell={Cell}
+┊   ┊283┊          cellHeight={30}
+┊   ┊284┊          cellProps={{
+┊   ┊285┊            isSelected: this.isSelected,
+┊   ┊286┊            toggle: this.toggle,
+┊   ┊287┊          }}
+┊   ┊288┊          sectionListItem={SectionItem}
+┊   ┊289┊          sectionHeader={SectionHeader}
+┊   ┊290┊          sectionHeaderHeight={22.5}
+┊   ┊291┊        /> : undefined}
+┊   ┊292┊      </View>
+┊   ┊293┊    );
+┊   ┊294┊  }
+┊   ┊295┊}
+┊   ┊296┊
+┊   ┊297┊NewGroup.propTypes = {
+┊   ┊298┊  loading: PropTypes.bool.isRequired,
+┊   ┊299┊  navigation: PropTypes.shape({
+┊   ┊300┊    navigate: PropTypes.func,
+┊   ┊301┊    setParams: PropTypes.func,
+┊   ┊302┊    state: PropTypes.shape({
+┊   ┊303┊      params: PropTypes.object,
+┊   ┊304┊    }),
+┊   ┊305┊  }),
+┊   ┊306┊  user: PropTypes.shape({
+┊   ┊307┊    id: PropTypes.number,
+┊   ┊308┊    friends: PropTypes.arrayOf(PropTypes.shape({
+┊   ┊309┊      id: PropTypes.number,
+┊   ┊310┊      username: PropTypes.string,
+┊   ┊311┊    })),
+┊   ┊312┊  }),
+┊   ┊313┊  selected: PropTypes.arrayOf(PropTypes.object),
+┊   ┊314┊};
+┊   ┊315┊
+┊   ┊316┊const userQuery = graphql(USER_QUERY, {
+┊   ┊317┊  options: (ownProps) => ({ variables: { id: 1 } }), // fake for now
+┊   ┊318┊  props: ({ data: { loading, user } }) => ({
+┊   ┊319┊    loading, user,
+┊   ┊320┊  }),
+┊   ┊321┊});
+┊   ┊322┊
+┊   ┊323┊export default compose(
+┊   ┊324┊  userQuery,
+┊   ┊325┊)(NewGroup);
```

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -26,6 +26,38 @@
 ┊26┊26┊        groupId,
 ┊27┊27┊      });
 ┊28┊28┊    },
+┊  ┊29┊    createGroup(_, { name, userIds, userId }) {
+┊  ┊30┊      return User.findOne({ where: { id: userId } })
+┊  ┊31┊        .then(user => user.getFriends({ where: { id: { $in: userIds } } })
+┊  ┊32┊          .then(friends => Group.create({
+┊  ┊33┊            name,
+┊  ┊34┊            users: [user, ...friends],
+┊  ┊35┊          })
+┊  ┊36┊            .then(group => group.addUsers([user, ...friends])
+┊  ┊37┊              .then(() => group),
+┊  ┊38┊            ),
+┊  ┊39┊          ),
+┊  ┊40┊        );
+┊  ┊41┊    },
+┊  ┊42┊    deleteGroup(_, { id }) {
+┊  ┊43┊      return Group.find({ where: id })
+┊  ┊44┊        .then(group => group.getUsers()
+┊  ┊45┊          .then(users => group.removeUsers(users))
+┊  ┊46┊          .then(() => Message.destroy({ where: { groupId: group.id } }))
+┊  ┊47┊          .then(() => group.destroy()),
+┊  ┊48┊        );
+┊  ┊49┊    },
+┊  ┊50┊    leaveGroup(_, { id, userId }) {
+┊  ┊51┊      return Group.findOne({ where: { id } })
+┊  ┊52┊        .then((group) => {
+┊  ┊53┊          group.removeUser(userId);
+┊  ┊54┊          return { id };
+┊  ┊55┊        });
+┊  ┊56┊    },
+┊  ┊57┊    updateGroup(_, { id, name }) {
+┊  ┊58┊      return Group.findOne({ where: { id } })
+┊  ┊59┊        .then(group => group.update({ name }));
+┊  ┊60┊    },
 ┊29┊61┊  },
 ┊30┊62┊  Group: {
 ┊31┊63┊    users(group) {
```

##### Changed server&#x2F;data&#x2F;schema.js
```diff
@@ -47,6 +47,10 @@
 ┊47┊47┊    createMessage(
 ┊48┊48┊      text: String!, userId: Int!, groupId: Int!
 ┊49┊49┊    ): Message
+┊  ┊50┊    createGroup(name: String!, userIds: [Int], userId: Int!): Group
+┊  ┊51┊    deleteGroup(id: Int!): Group
+┊  ┊52┊    leaveGroup(id: Int!, userId: Int!): Group # let user leave group
+┊  ┊53┊    updateGroup(id: Int!, name: String): Group
 ┊50┊54┊  }
 ┊51┊55┊  
 ┊52┊56┊  schema {
```

[}]: #
[{]: <helper> (navStep)

| [< Previous Step](step3.md) | [Next Step >](step5.md) |
|:--------------------------------|--------------------------------:|

[}]: #
