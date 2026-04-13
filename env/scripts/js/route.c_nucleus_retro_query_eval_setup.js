import cache from 'cache'

let trs = org.objects.c_task_response
    .aggregate()
    .match({ 
        'c_public_user._id': {
            $in: [
                "5b51f262fd298b0100a7494f",
                "5b51f1691911b501007f480a",
                "5b51f064fd298b0100a748aa",
                "5b51e410fd298b0100a746cc",
                "5b51e386fd298b0100a7463f",
                "5b51e2a91911b501007f45c3",
                "5b51e1951911b501007f4565",
                "5b51db70fd298b0100a744d6"
            ]
        },
        c_status: {$in: ['Incomplete', 'Complete', 'New']}
    })
    .group({
        _id: 'c_public_user._id',
        responses: {$push: '_id'}
    })
    .toArray()
    .reduce((x,y) => x.concat(y.responses),[])

cache.set('retroQuery', trs)
return { hasMore: trs.length > 0 }