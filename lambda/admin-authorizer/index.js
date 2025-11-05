exports.handler = async (event) => {
    const token = event.authorizationToken?.replace('Bearer ', '');
    
    if (!token) {
        throw new Error('Unauthorized');
    }

    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        const groups = payload['cognito:groups'] || [];
        
        if (!groups.includes('admin')) {
            throw new Error('Forbidden: Admin access required');
        }

        return {
            principalId: payload.sub,
            policyDocument: {
                Version: '2012-10-17',
                Statement: [{
                    Action: 'execute-api:Invoke',
                    Effect: 'Allow',
                    Resource: event.methodArn,
                }],
            },
            context: {
                userId: payload.sub,
                email: payload.email || '',
                groups: groups.join(','),
            },
        };
    } catch (error) {
        throw new Error('Unauthorized');
    }
};
