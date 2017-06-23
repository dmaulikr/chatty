import gql from 'graphql-tag';

import MESSAGE_FRAGMENT from './message.fragment';

// get the user and all user's groups
export const USER_QUERY = gql`
  query user($id: Int) {
    user(id: $id) {
      id
      avatar
      badgeCount
      email
      registrationId
      username
      groups {
        id
        name
        icon
        unreadCount
        messages(limit: 1) { # we don't need to use variables
          ... MessageFragment
        }
      }
      friends {
        id
        username
      }
    }
  }
  ${MESSAGE_FRAGMENT}
`;

export default USER_QUERY;
