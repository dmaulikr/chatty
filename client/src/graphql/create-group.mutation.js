import gql from 'graphql-tag';

import MESSAGE_FRAGMENT from './message.fragment';

const CREATE_GROUP_MUTATION = gql`
  mutation createGroup($name: String!, $userIds: [Int!]) {
    createGroup(name: $name, userIds: $userIds) {
      id
      name
      users {
        id
      }
      messages(limit: 1) { # we don't need to use variables
        ... MessageFragment
      }
    }
  }
  ${MESSAGE_FRAGMENT}
`;

export default CREATE_GROUP_MUTATION;
