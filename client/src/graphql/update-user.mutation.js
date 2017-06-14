import gql from 'graphql-tag';

const UPDATE_USER_MUTATION = gql`
  mutation updateUser($registrationId: String) {
    updateUser(registrationId: $registrationId) {
      id
      registrationId
    }
  }
`;

export default UPDATE_USER_MUTATION;
