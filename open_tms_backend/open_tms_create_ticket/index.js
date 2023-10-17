import { shared } from '@appblocks/node-sdk'

const validateField = (field, fieldName) => {
  if (!field) {
    return {
      code: 'BAD_REQUEST',
      message: `Please provide a valid ${fieldName}`,
    }
  }
  return null
}

const handler = async (event) => {
  const { req, res } = event
  const { sendResponse, prisma, validateRequestMethod } = await shared.getShared()

  // health check
  if (req.params.health === 'health') {
    return sendResponse(res, 200, { message: 'Health check success' })
  }

  await validateRequestMethod(req, ['POST'])

  const requestBody = req.body || {}
  /**
   * Add create ticket logic here
   */

  // check for if any fields are empty
  const errors = []
  const fieldsToCheck = ['name', 'department', 'ticket_type']

  for (const fieldToCheck of fieldsToCheck) {
    const error = validateField(requestBody?.[fieldToCheck], fieldToCheck)
    if (error) {
      errors.push(error)
    }
  }

  if (errors?.length) {
    return sendResponse(res, 400, {
      meta: {
        status: 400,
        message: 'Bad Request',
      },
      errors,
    })
  }

  try {
    // create new ticket

    // start transaction

    let ticketId = null
    let ticketRevision = null
    await prisma.$transaction(async (transactionPrisma) => {
      // get the current organisation of user
      const org = await transactionPrisma.org_member_roles.findFirst({
        where: {
          user_id: req.user?.id,
        },
        select: {
          id: true,
        },
      })

      const newTicket = await transactionPrisma.ticket.create({
        data: {
          created_by: req.user.id,
          organisation_id: org?.id || '090c4951-217d-4513-b016-49ed085d24d1',
        },
      })

      ticketId = newTicket.id

      ticketRevision = await transactionPrisma.ticket_revision.create({
        data: {
          ticket_id: ticketId,
          title: requestBody.name,
          description: requestBody.description,
          created_by: req.user.id,
        },
      })

      // Get the id of the 'ticket_raised' stage
      const initialStage = await transactionPrisma.stage.findUnique({
        where: {
          name: 'ticket_raised',
        },
      })

      await transactionPrisma.ticket_activity.create({
        data: { ticket_revision_id: ticketRevision?.id, current_stage: initialStage?.id, created_by: req.user.id },
      })
    })

    return sendResponse(res, 200, {
      meta: {
        status: 200,
        message: 'Ticket created succesfully',
      },
      data: {
        id: ticketId,
        revision_id: ticketRevision?.id,
      },
    })
  } catch (error) {
    console.log(error)
    return sendResponse(res, 500, {
      meta: {
        status: 500,
        message: 'Something went wrong.',
      },
      errors: [
        {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong.',
        },
      ],
    })
  }
}

export default handler
