import gql from 'graphql-tag';

const UPDATE_USER_MUTATION = gql`
  mutation updateUser($badgeCount: Int, $registrationId: String, $avatar: File) {
    updateUser(badgeCount: $badgeCount, registrationId: $registrationId, avatar: $avatar) {
      id
      avatar
      badgeCount
      registrationId
    }
  }
`;

export default UPDATE_USER_MUTATION;
