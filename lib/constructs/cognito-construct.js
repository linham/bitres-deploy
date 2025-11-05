const { Duration, SecretValue } = require('aws-cdk-lib');
const cognito = require('aws-cdk-lib/aws-cognito');
const { Construct } = require('constructs');

class CognitoConstruct extends Construct {
    constructor(scope, id, props) {
        super(scope, id);

        const { triggerLambda, googleClientId, googleClientSecret, callbackUrls, logoutUrls } = props;

        this.userPool = new cognito.UserPool(this, 'UserPoolV2', {
            userPoolName: 'bitres-user-pool',
            selfSignUpEnabled: true,
            signInAliases: { email: true, username: false },
            autoVerify: { email: true },
            standardAttributes: {
                email: { required: true, mutable: true },
                name: { required: false, mutable: true },
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            lambdaTriggers: {
                postConfirmation: triggerLambda,
                postAuthentication: triggerLambda,
                preSignUp: triggerLambda,
            },
            mfa: cognito.Mfa.OPTIONAL,
            mfaSecondFactor: {
                otp: true,
                sms: false,
            }
        });

        if (googleClientId && googleClientSecret) {
            const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
                userPool: this.userPool,
                clientId: googleClientId,
                clientSecret: googleClientSecret,
                scopes: ['email', 'profile', 'openid'],
                attributeMapping: {
                    email: cognito.ProviderAttribute.GOOGLE_EMAIL,
                    givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
                    familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
                    profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
                },
            });
            this.googleProvider = googleProvider;
        }

        const cfnUserPool = this.userPool.node.defaultChild;
        cfnUserPool.addPropertyOverride('Schema', [
            { Name: 'email', AttributeDataType: 'String', Mutable: true, Required: true },
            { Name: 'name', AttributeDataType: 'String', Mutable: true, Required: false }
        ]);

        const clientReadAttributes = new cognito.ClientAttributes()
            .withStandardAttributes({ email: true, name: true });

        const clientWriteAttributes = new cognito.ClientAttributes()
            .withStandardAttributes({ email: true, name: true });

        const supportedProviders = [cognito.UserPoolClientIdentityProvider.COGNITO];
        if (googleClientId && googleClientSecret) {
            supportedProviders.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
        }

        this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
            userPool: this.userPool,
            userPoolClientName: 'bitres-app-client',
            generateSecret: false,
            readAttributes: clientReadAttributes,
            writeAttributes: clientWriteAttributes,
            authFlows: {
                userPassword: true,
                userSrp: true,
                adminUserPassword: true,
                custom: true,
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                    implicitCodeGrant: true,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                    cognito.OAuthScope.PHONE,
                ],
                callbackUrls: callbackUrls,
                logoutUrls: logoutUrls,
            },
            refreshTokenValidity: Duration.days(30),
            accessTokenValidity: Duration.days(1),
            idTokenValidity: Duration.days(1),
            supportedIdentityProviders: supportedProviders,
            preventUserExistenceErrors: true,
        });

        if (this.googleProvider) {
            this.userPoolClient.node.addDependency(this.googleProvider);
        }

        const domain = new cognito.UserPoolDomain(this, 'CognitoDomain', {
            userPool: this.userPool,
            cognitoDomain: { domainPrefix: 'bitres-auth' },
        });
        this.hostedUiUrl = `https://${domain.domainName}.auth.${this.userPool.stack.region}.amazoncognito.com`;

        this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
            identityPoolName: 'bitres-identity-pool',
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [{
                clientId: this.userPoolClient.userPoolClientId,
                providerName: this.userPool.userPoolProviderName,
            }],
        });

        // Admin Group
        this.adminGroup = new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
            userPoolId: this.userPool.userPoolId,
            groupName: 'admin',
            description: 'Administrator group with full access',
            precedence: 1,
        });
    }
}

module.exports = { CognitoConstruct };
