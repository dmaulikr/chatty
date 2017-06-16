import gql from 'graphql-tag';

const UPDATE_USER_MUTATION = gql`
  mutation updateUser($badgeCount: Int, $registrationId: String) {
    updateUser(badgeCount: $badgeCount, registrationId: $registrationId) {
      id
      badgeCount
      registrationId
    }
  }
`;

export default UPDATE_USER_MUTATION;
