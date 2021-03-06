'use strict'
const bech32 = require('bech32')
const crypto = require('crypto')
const LightningService = use('App/Services/LndService')
const Logger = use('Logger')
const User  = use('App/Models/User')
const Hash = use('Hash')


const NonceHashMap = {}
const k1HashMap = {}

// see https://github.com/btcontract/lnurl-rfc/blob/master/spec.md
class LnurlController {

async createUser({auth, request, view}) {
    
    try {
        await auth.check()
        return view.render('welcome')
    } catch (err){
        const {username} = request.all()
        const existingUser = await User.findBy('username', username)
        if (!existingUser) {
            const newuser = await new User()
            newuser.username = username
            await newuser.save()
            await auth.login(newuser)
            return view.render('welcome')
        } else {
            await auth.login(existingUser)
            return view.render('welcome')
        }
    }
}

    // route: /withdraw/request
async requestWithdrawal ({auth, response, request}) {
    try{

            // create random nonce for the user
            const nonce = String(Math.floor(Math.random() * 1000000)) // TODO: stronger source of randomness
            // const nonce = String(crypto.randomBytes(100))
            Logger.info(nonce)

            // add item to hashmap
            NonceHashMap[Hash.make(nonce)] = auth.user.id 
                
            // let words = bech32.toWords(Buffer.from('https://localhost:3322/withdraw/confirmation?q='+String.valueOf(nonce), 'utf8'))
            let words = bech32.toWords(Buffer.from('https://lnurl.satoshis.games/conf?q='+nonce, 'utf8'))

           
            return response.json({
                data: bech32.encode('lnurl', words)
            })
    }catch(error){
        Logger.error(error)
        return response.json({error})
    }
}

// route: /withdraw/confirmation
async confirmWithdrawal ({response, request}) {
        
        const { q } = request.all()

        if (Hash.make(q) in NonceHashMap){

            const existingUserId = NonceHashMap[Hash.make(q)]

            delete NonceHashMap[Hash.make(q)]; // Invalidate a QR

            const secondLevelNonce = String(Math.floor(Math.random() * 1000000)) // TODO: stronger source of randomness

            k1HashMap[Hash.make(secondLevelNonce)] = existingUserId

            // Return json object with the resources needed for the withdrawal
            return response.json({
                callback: "https://satoshis.games/withdrawal/execute",
                k1: secondLevelNonce,
                maxWithdrawable: 5000, // millisatoshis
                defaultDescription: "withdraw from satoshis.games",
                tag: "withdrawRequest",
            })
        }
}

// route: /withdraw/execute
async executeWithrawal ({request}) {
        
        const { k1 } = request.all() 

        const { pr } = request.all()
        
        // verify the user who made the 1st request has the k1 secret to withdraw his funds
        // otherwise anyone could scan the qr code quicker and steal those funds
        if (Hash.make(k1) in k1HashMap){

            const existingUserId = k1HashMap[Hash.make(k1)]

            delete k1HashMap[Hash.make(k1)];

            LightningService.payment(pr)

            response.ok()
        } else {
        return json({ status: "ERROR", reason: "Second level nonce not found" })
        }
    }
}

module.exports = LnurlController
